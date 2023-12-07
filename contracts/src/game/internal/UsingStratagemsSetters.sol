// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./UsingStratagemsState.sol";
import "../interface/UsingStratagemsEvents.sol";
import "./UsingStratagemsUtils.sol";
import "../../utils/PositionUtils.sol";

abstract contract UsingStratagemsSetters is UsingStratagemsState, UsingStratagemsUtils {
	using PositionUtils for uint64;

	constructor(Config memory config) UsingStratagemsState(config) {}

	function _makeCommitment(address player, bytes24 commitmentHash, uint256 inReserve) internal {
		Commitment storage commitment = _commitments[player];

		(uint24 epoch, bool commiting) = _epoch();

		if (!commiting) {
			revert InRevealPhase();
		}
		if (commitment.epoch != 0 && commitment.epoch != epoch) {
			revert PreviousCommitmentNotRevealed();
		}

		commitment.hash = commitmentHash;
		commitment.epoch = epoch;

		// for withdrawal, we still require a minimal reserve so player cannot change their mind without losing at least one token
		// TODO we might want to increase that value to 10x as 10 moves might quite common, at least on some networks
		if (inReserve < NUM_TOKENS_PER_GEMS) {
			// TODO? special error for this case ?
			revert ReserveTooLow(inReserve, NUM_TOKENS_PER_GEMS);
		}

		emit CommitmentMade(player, epoch, commitmentHash);
	}

	function _resolveMoves(
		address player,
		uint24 epoch,
		Move[] memory moves,
		address tokenGiver
	) internal returns (uint256 newReserveAmount) {
		// max number of transfer is (4+1) * moves.length
		// (for each move's cell's neighbours potentially being a different account)
		// limiting the number of move per commitment reveal to 32 or, even more probably, should cover this unlikely scenario
		TokenTransferCollection memory transferCollection = TokenTransferCollection({
			transfers: new TokenTransfer[](moves.length * 5),
			numTransfers: 0
		});
		MoveTokens memory tokens;
		for (uint256 i = 0; i < moves.length; i++) {
			(uint256 placed, uint256 burnt, uint256 returned) = _computeMove(
				transferCollection,
				player,
				epoch,
				moves[i]
			);

			tokens.tokensPlaced += placed;
			tokens.tokensBurnt += burnt;
			tokens.tokensReturned += returned;
		}

		logger.logTransfers(0, "resolveMoves", transferCollection);

		_multiTransfer(TOKENS, transferCollection);

		newReserveAmount = _tokensInReserve[player];

		// Note: even if funds can comes from outside the reserve, we still check it
		// This ensure player have to have a reserve and cannot escape the slash if not
		if (newReserveAmount < tokens.tokensPlaced + tokens.tokensBurnt) {
			revert ReserveTooLow(newReserveAmount, tokens.tokensPlaced + tokens.tokensBurnt);
		}
		if (tokenGiver == address(0)) {
			newReserveAmount -= tokens.tokensPlaced + tokens.tokensBurnt;
			_tokensInReserve[player] = newReserveAmount;
		} else {
			if (tokens.tokensPlaced != 0) {
				// TODO use TransferCollection too here
				TOKENS.transferFrom(tokenGiver, address(this), tokens.tokensPlaced);
			}
			if (tokens.tokensBurnt != 0) {
				// TODO use TransferCollection too here
				TOKENS.transferFrom(tokenGiver, BURN_ADDRESS, tokens.tokensBurnt);
			}
		}
		// option to return in reserve ?
		// TODO use TransferCollection too here
		if (tokens.tokensReturned != 0) {
			// console.log("tokensReturned");
			// console.log(tokens.tokensReturned);
			TOKENS.transfer(player, tokens.tokensReturned);
		}
	}

	function _countBits(uint8 n) internal pure returns (uint8 count) {
		while (n != 0) {
			n = n & (n - 1);
			count++;
		}
	}

	// Note on COLLISION
	// If one color was used more than other, we could consider the cell having N owner and N times the number of tokens
	// such cells would be a good target for others
	// On the other end, on winning agains other cells, owner of such cell would have to divide the winnings
	// TODO revisit this
	// we could also refund the part
	// so if there is 3 green 2 blue and 1 red, then green win and the cell become green
	// player we put blue or red get refunded their respective gems
	// the players we put green get refunded 2/3 so that the cell still contains only 1
	// if there was 3 green and 3 blue and 1 red then the cell becomes black
	// every player get refunded 6/7 so that the black cell only has 1
	// note that the issue with green winning above is that winnings need to be distributed to all 3 players we put green
	// and since the number is technically unbounded, we have to use a splitter contract where player withdraw their winnings
	// this add UX complexity and some cost for withdrawals
	function _computeMove(
		TokenTransferCollection memory transferCollection,
		address player,
		uint24 epoch,
		Move memory move
	) internal returns (uint256 tokensPlaced, uint256 tokensBurnt, uint256 tokensReturned) {
		Cell memory currentState = _getUpdatedCell(move.position, epoch);

		logger.logCell(
			0,
			string.concat("_computeMove at epoch ", Strings.toString(epoch)),
			move.position,
			currentState,
			address(uint160(_owners[move.position]))
		);

		// we might have distribution still to do
		uint8 distribution = currentState.distribution;
		if (currentState.life == 0 && currentState.lastEpochUpdate != 0) {
			// if we just died, currentState.lastEpochUpdate > 0
			// we have to distribute to all
			distribution = (currentState.enemyMap << 4) + _countBits(currentState.enemyMap);

			/// we are now dead for real
			currentState.lastEpochUpdate = 0;
		}

		// we then apply our move:

		// first we do some validity checks
		if (move.color == Color.None) {
			if (currentState.life != MAX_LIFE || _ownerOf(move.position) != player) {
				// invalid move
				return (0, 0, NUM_TOKENS_PER_GEMS);
			}

			_collectTransfer(transferCollection, TokenTransfer({to: payable(player), amount: NUM_TOKENS_PER_GEMS}));
		}
		// then we consider the case of collision and transform such move as Color Evil
		else if (currentState.epochWhenTokenIsAdded == epoch) {
			if (currentState.life != 0) {
				move.color = Color.Evil;
				// TODO Add further stake, or do we burn? or return?
			} else {
				// invalid move, on top of a MAX, that become None ?
				return (0, 0, NUM_TOKENS_PER_GEMS);
			}
		}

		(int8 newDelta, uint8 newEnemyMap) = _propagate(
			transferCollection,
			move,
			epoch,
			currentState.color,
			distribution
		);

		emit MoveProcessed(move.position, player, currentState.color, move.color);
		currentState.color = move.color;
		currentState.distribution = 0;
		currentState.epochWhenTokenIsAdded = epoch; // used to prevent overwriting, even Color.None

		if (currentState.color == Color.None) {
			currentState.life = 0;
			currentState.lastEpochUpdate = 0;
			currentState.delta = 0;
			currentState.enemyMap = 0;
			_owners[move.position] = 0;
			tokensReturned = NUM_TOKENS_PER_GEMS;
		} else {
			tokensPlaced = NUM_TOKENS_PER_GEMS;

			currentState.enemyMap = newEnemyMap;

			currentState.delta = newDelta;
			currentState.life = 1;
			currentState.lastEpochUpdate = epoch;
			if (currentState.color == Color.Evil) {
				_owners[move.position] = uint256(uint160(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF));
			} else {
				_owners[move.position] = uint256(uint160(player));
			}
		}

		_cells[move.position] = currentState;

		logger.logCell(
			0,
			string.concat("AFTER ", Strings.toString(epoch)),
			move.position,
			currentState,
			address(uint160(_owners[move.position]))
		);
	}

	function _propagate(
		TokenTransferCollection memory transferCollection,
		Move memory move,
		uint24 epoch,
		Color color,
		uint8 distribution
	) internal returns (int8 newDelta, uint8 newEnemyMap) {
		(
			int8 newComputedDelta,
			uint8 newComputedEnemyMap,
			uint8 numDue,
			address[4] memory ownersToPay
		) = _updateNeighbours(move.position, epoch, color, move.color, distribution);

		if (numDue > 0) {
			_collectTransfer(
				transferCollection,
				TokenTransfer({to: payable(_ownerOf(move.position)), amount: (numDue * NUM_TOKENS_PER_GEMS) / 12})
			);
		}
		for (uint8 i = 0; i < 4; i++) {
			if (ownersToPay[i] != address(0)) {
				_collectTransfer(
					transferCollection,
					TokenTransfer({to: payable(ownersToPay[i]), amount: (NUM_TOKENS_PER_GEMS / (distribution & 0x0f))})
				);
			}
		}
		newDelta = newComputedDelta;
		newEnemyMap = newComputedEnemyMap;
	}

	function _poke(TokenTransferCollection memory transferCollection, uint64 position, uint24 epoch) internal {
		Cell memory currentState = _getUpdatedCell(position, epoch);

		logger.logCell(
			0,
			string.concat("_poke at epoch ", Strings.toString(epoch)),
			position,
			currentState,
			address(uint160(_owners[position]))
		);

		// we might have distribution still to do
		uint8 distribution = currentState.distribution;
		if (currentState.life == 0 && currentState.lastEpochUpdate != 0) {
			// if we just died, currentState.lastEpochUpdate > 0
			// we have to distribute to all
			distribution = (currentState.enemyMap << 4) + _countBits(currentState.enemyMap);

			/// we are now dead for real
			currentState.lastEpochUpdate = 0;
		}

		(, , uint8 numDue, address[4] memory ownersToPay) = _updateNeighbours(
			position,
			epoch,
			currentState.color,
			currentState.color,
			distribution
		);

		if (numDue > 0) {
			_collectTransfer(
				transferCollection,
				TokenTransfer({to: payable(_ownerOf(position)), amount: numDue * NUM_TOKENS_PER_GEMS})
			);
		}
		for (uint8 i = 0; i < 4; i++) {
			if (ownersToPay[i] != address(0)) {
				_collectTransfer(
					transferCollection,
					TokenTransfer({to: payable(ownersToPay[i]), amount: NUM_TOKENS_PER_GEMS / (distribution & 0x0f)})
				);
			}
		}

		logger.logCell(
			0,
			string.concat("AFTER poke (before zeroed distribution) at epoch ", Strings.toString(epoch)),
			position,
			currentState,
			address(uint160(_owners[position]))
		);

		currentState.distribution = 0;
		_cells[position] = currentState;
	}

	function _updateNeighbours(
		uint64 position,
		uint24 epoch,
		Color oldColor,
		Color newColor,
		uint8 distribution
	) internal returns (int8 newDelta, uint8 newenemyMap, uint8 numDue, address[4] memory ownersToPay) {
		unchecked {
			logger.logPosition("from", position);
			console.log("distribution %i %i", distribution >> 4, distribution & 0x0F);

			int8 enemyOrFriend;
			uint8 due;
			{
				uint64 upPosition = position.offset(0, -1);
				logger.logPosition("upPosition", upPosition);
				(enemyOrFriend, due) = _updateCell(upPosition, epoch, 2, oldColor, newColor);
				if (enemyOrFriend < 0) {
					newenemyMap = newenemyMap | 1;
				}
				numDue += due;
				if ((distribution >> 4) & 1 == 1) {
					console.log("upPosition %i", distribution);
					// TODO?: if we decide to group owner in the cell struct, we should get the cell in memory in that function
					ownersToPay[0] = _ownerOf(upPosition);
				}
				newDelta += enemyOrFriend;
			}
			{
				uint64 leftPosition = position.offset(-1, 0);
				logger.logPosition("leftPosition", leftPosition);
				(enemyOrFriend, due) = _updateCell(leftPosition, epoch, 3, oldColor, newColor);
				if (enemyOrFriend < 0) {
					newenemyMap = newenemyMap | 2;
				}
				numDue += due;
				if ((distribution >> 4) & 2 == 2) {
					console.log("leftPosition %i", distribution);
					ownersToPay[1] = _ownerOf(leftPosition);
				}
				newDelta += enemyOrFriend;
			}

			{
				uint64 downPosition = position.offset(0, 1);
				logger.logPosition("downPosition", downPosition);
				(enemyOrFriend, due) = _updateCell(downPosition, epoch, 0, oldColor, newColor);
				if (enemyOrFriend < 0) {
					newenemyMap = newenemyMap | 4;
				}
				numDue += due;
				if ((distribution >> 4) & 4 == 4) {
					console.log("downPosition %i", distribution);
					ownersToPay[2] = _ownerOf(downPosition);
				}
				newDelta += enemyOrFriend;
			}
			{
				uint64 rightPosition = position.offset(1, 0);
				logger.logPosition("rightPosition", rightPosition);
				(enemyOrFriend, due) = _updateCell(rightPosition, epoch, 1, oldColor, newColor);
				if (enemyOrFriend < 0) {
					newenemyMap = newenemyMap | 8;
				}
				numDue += due;
				if ((distribution >> 4) & 8 == 8) {
					console.log("rightPosition %i", distribution);
					ownersToPay[3] = _ownerOf(rightPosition);
				}
				newDelta += enemyOrFriend;
			}
		}
	}

	/// @dev This update the cell in storage
	function _updateCell(
		uint64 position, // position to update
		uint24 epoch,
		uint8 neighbourIndex, // index from point of view of cell being updated
		Color oldColor, // old Color of the neighbor
		Color newColor // new color of the neighbor
	) internal returns (int8 enemyOrFriend, uint8 due) {
		Cell memory cell = _cells[position];

		uint24 lastUpdate = cell.lastEpochUpdate;
		Color color = cell.color;
		if (color != Color.None) {
			// if the color of the cell being update is not Nome
			// we then check the neighbor new color
			// if it same as the cell color, then we report the cell as friendly to the neighbor
			// else it is an enemy
			// note that _updateCell should only be called if oldColor != newColor
			enemyOrFriend = color == newColor ? int8(1) : int8(-1);
		}
		if (lastUpdate >= 1 && color != Color.None) {
			// we only consider cell with color that are not dead
			if (cell.life > 0 && lastUpdate < epoch) {
				// of there is life to update we compute the new life
				(uint8 newLife, uint24 epochUsed) = _computeNewLife(
					lastUpdate,
					cell.enemyMap,
					cell.delta,
					cell.life,
					epoch
				);
				due = _updateCellFromNeighbor(position, cell, newLife, epochUsed, neighbourIndex, oldColor, newColor);
			} else {
				due = _updateCellFromNeighbor(position, cell, cell.life, epoch, neighbourIndex, oldColor, newColor);
			}
		}
	}

	function _updateCellFromNeighbor(
		uint64 position, // position of the cell to be updated
		Cell memory cell, // cell to be updated
		uint8 newLife, // new life value for the celll
		uint24 epoch, // epoch at which the update occured (epochUsed TODO: confirm its use)
		uint8 neighbourIndex, // the neighbor triggering the update and for which we return whether it should receive its due
		Color oldColor, // old color of that neighbor
		Color newColor // new color of that neighbor
	) internal returns (uint8 due) {
		if (cell.life > 0 && newLife == 0) {
			// we just died, we establish the distributionMap and counts
			cell.distribution = (cell.enemyMap << 4) + _countBits(cell.enemyMap);
		}

		logger.logCell(
			0,
			string.concat("_updateCellFromNeighbor  index", Strings.toString(neighbourIndex)),
			position,
			cell,
			address(uint160(_owners[position]))
		);

		if ((cell.distribution >> 4) & (2 ** neighbourIndex) == 2 ** neighbourIndex) {
			due = 12 / (cell.distribution & 0x0f);
			cell.distribution =
				(uint8(uint256(cell.distribution >> 4) & (~(2 ** uint256(neighbourIndex)))) << 4) +
				(cell.distribution & 0x0f);
		}

		if (oldColor != newColor) {
			if (newColor == Color.None) {
				if (cell.color == oldColor) {
					cell.delta -= 1;
				} else {
					cell.delta += 1;
					cell.enemyMap = cell.enemyMap & uint8((1 << neighbourIndex) ^ 0xFF);
				}
			} else if (cell.color == oldColor) {
				// then newColor is different (see assert above)
				cell.enemyMap = cell.enemyMap | uint8(1 << neighbourIndex);
				cell.delta -= 2;
			} else if (cell.color == newColor) {
				// then old color was different
				cell.delta += (oldColor == Color.None ? int8(1) : int8(2));
				cell.enemyMap = cell.enemyMap & uint8((1 << neighbourIndex) ^ 0xFF);
			} else if (oldColor == Color.None) {
				// if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
				cell.delta -= 1;
				cell.enemyMap = cell.enemyMap | uint8(1 << neighbourIndex);
			}
		}

		cell.lastEpochUpdate = epoch;
		cell.life = newLife;

		logger.logCell(
			0,
			string.concat("AFTER _updateCellFromNeighbor  index", Strings.toString(neighbourIndex)),
			position,
			cell,
			address(uint160(_owners[position]))
		);

		_cells[position] = cell;
	}
}

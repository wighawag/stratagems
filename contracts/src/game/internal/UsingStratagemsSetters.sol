// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './UsingStratagemsState.sol';
import '../interface/UsingStratagemsEvents.sol';

abstract contract UsingStratagemsSetters is UsingStratagemsState {
	constructor(Config memory config) UsingStratagemsState(config) {}

	function _makeCommitment(address player, bytes24 commitmentHash, uint256 inReserve) internal {
		Commitment storage commitment = _commitments[player];

		(uint32 epoch, bool commiting) = _epoch();

		require(commiting, 'IN_RESOLUTION_PHASE');
		require(commitment.epoch == 0 || commitment.epoch == epoch, 'PREVIOUS_COMMITMENT_TO_RESOLVE');

		commitment.hash = commitmentHash;
		commitment.epoch = epoch;

		require(inReserve >= NUM_TOKENS_PER_GEMS, 'NEED_AT_LEAST_ONE_TOKEN_IN_RESERVE');

		emit CommitmentMade(player, epoch, commitmentHash);
	}

	function _resolveMoves(
		address player,
		uint32 epoch,
		Move[] memory moves,
		address tokenGiver
	) internal returns (uint256 newReserveAmount) {
		// max number of transfer is (4+8) * moves.length
		// (for each move's cell's neighbours potentially being a different account)
		// + each neighbor death distributions
		// limiting the number of move per commitment resolution to 16 should cover this unlikely scenario
		TokenTransfer[] memory transfers = new TokenTransfer[](moves.length * 12);
		uint256 numAddressesToDistributeTo = 0;
		MoveTokens memory tokens;
		for (uint256 i = 0; i < moves.length; i++) {
			(uint256 placed, uint256 burnt, uint256 returned, uint256 newNumAddressesToDistributeTo) = _computeMove(
				transfers,
				numAddressesToDistributeTo,
				player,
				epoch,
				moves[i]
			);

			numAddressesToDistributeTo = newNumAddressesToDistributeTo;
			tokens.tokensPlaced += placed;
			tokens.tokensBurnt += burnt;
			tokens.tokensReturned += returned;
		}

		_multiTransfer(transfers, numAddressesToDistributeTo);

		newReserveAmount = _tokensInReserve[player];

		// Note: even if funds can comes from outside the reserver, we still check it
		// This ensure player have to have a reserve and cannot escape the slash if not
		require(newReserveAmount >= tokens.tokensPlaced + tokens.tokensBurnt, 'NOT_ENOUGH_RESERVE');
		if (tokenGiver == address(0)) {
			newReserveAmount -= tokens.tokensPlaced + tokens.tokensBurnt;
			_tokensInReserve[player] = newReserveAmount;
		} else {
			if (tokens.tokensPlaced != 0) {
				TOKENS.transferFrom(tokenGiver, address(this), tokens.tokensPlaced);
			}
			if (tokens.tokensBurnt != 0) {
				TOKENS.transferFrom(tokenGiver, BURN_ADDRESS, tokens.tokensBurnt);
			}
		}
		// option to return in reserve ?
		if (tokens.tokensReturned != 0) {
			TOKENS.transfer(player, tokens.tokensReturned);
		}
	}

	// Note on COLLISION
	// we could order color in a certain way so one color takes precedence over another
	// And if the same color was used, we could consider the cell having N owner and N times the number of tokens
	// such cells would be a good target for others
	// On the other end,  on winning agains other cells, owner of such cell would have to divide the winnings
	function _computeMove(
		TokenTransfer[] memory transfers,
		uint256 numAddressesToDistributeTo,
		address player,
		uint32 epoch,
		Move memory move
	)
		internal
		returns (
			uint256 tokensPlaced,
			uint256 tokensBurnt,
			uint256 tokensReturned,
			uint256 newNumAddressesToDistributeTo
		)
	{
		require(move.color != Color.Evil, 'INVALID_EVIL_MOVE');
		Cell memory currentState = _getUpdatedCell(move.position, epoch);

		logger.logCell(
			0,
			string.concat('_computeMove at epoch ', Strings.toString(epoch)),
			move.position,
			currentState
		);

		if (move.color == Color.None) {
			// this is a leave move
			if (currentState.life == MAX_LIFE && _owners[move.position] == player) {
				// only valid id life == MAX_LIFE and player is owner
				// we reset all, except the lastEpochUpdate
				// this allow us to make sure nobody else can make a move on that cell
				currentState.life = 0;
				currentState.color = Color.None;
				currentState.lastEpochUpdate = epoch;
				currentState.delta = 0;
				currentState.enemymask = 0;
				currentState.epochWhenTokenIsAdded = 0;
				_cells[move.position] = currentState;

				// we can't reset the owner yet as neighbors dieing in epoch should reward the owner

				// we still need to update the neighbors to update their enemymask and delta
				// TODO update neighbors
			}
			// we return
			return (0, 0, NUM_TOKENS_PER_GEMS, numAddressesToDistributeTo);
		}

		if (currentState.life == 0 && currentState.lastEpochUpdate != 0) {
			// we are here because life reach zero (lastEpochUpdate != 0 indicates that the cell was alive and not reset like below)
			// Note: we need to pay attention when we add the leave mechanism
			newNumAddressesToDistributeTo = _distributeDeath(
				transfers,
				numAddressesToDistributeTo,
				move.position,
				currentState.enemymask,
				currentState.lastEpochUpdate
			);
		}

		if (currentState.epochWhenTokenIsAdded == epoch) {
			// COLLISION
			// you get your token back
			// the other player too
			if (currentState.life != 0) {
				// we reset the Color to None and update the neighbor with that
				(, , uint256 latestNumAddressesToDistributeTo) = _updateNeighbours(
					transfers,
					newNumAddressesToDistributeTo,
					move.position,
					epoch,
					currentState.color,
					Color.None
				);
				newNumAddressesToDistributeTo = latestNumAddressesToDistributeTo;

				// giving back
				_tokensInReserve[_owners[move.position]] += NUM_TOKENS_PER_GEMS;

				currentState.life = 0;
				currentState.color = Color.None;
				currentState.lastEpochUpdate = 0;
				currentState.delta = 0;
				currentState.enemymask = 0;
				_cells[move.position] = currentState;
				_owners[move.position] = address(0);
			} else {
				// we skip
				// tokensPlaced = 0 so this is not counted
				if (currentState.life == 0) {
					_cells[move.position] = currentState;
					_owners[move.position] = address(0);
					// TODO Transfer
				}
			}
		} else if (currentState.life == 0 && (currentState.lastEpochUpdate == 0 || currentState.color != Color.None)) {
			if (currentState.life == 0 || currentState.color != move.color) {
				// only update neighbour if color changed or if life is zero, since in that case the delta is lost (TODO revisit this)
				(int8 newDelta, uint8 newEnemymask, uint256 latestNumAddressesToDistributeTo) = _updateNeighbours(
					transfers,
					newNumAddressesToDistributeTo,
					move.position,
					epoch,
					currentState.color,
					move.color
				);
				newNumAddressesToDistributeTo = latestNumAddressesToDistributeTo;

				currentState.life = 1;
				currentState.epochWhenTokenIsAdded = epoch;
				currentState.lastEpochUpdate = epoch;
				currentState.color = move.color;
				currentState.delta = newDelta;
				currentState.enemymask = newEnemymask;

				logger.logCell(0, 'after: _updateNeighbor', move.position, currentState);
			} else {
				// TODO fetch neighbours to compute delta
				currentState.delta = 0;
				currentState.enemymask = 0;
			}

			tokensPlaced = NUM_TOKENS_PER_GEMS;
			_cells[move.position] = currentState;
			_owners[move.position] = player;
			// TODO Transfer
		} else {
			// invalid move
			tokensBurnt = NUM_TOKENS_PER_GEMS;
			if (currentState.life == 0) {
				_cells[move.position] = currentState;
				_owners[move.position] = address(0);
				// TODO Transfer
			}
		}
	}

	function _poke(
		TokenTransfer[] memory transfers,
		uint256 numAddressesToDistributeTo,
		uint64 position
	) internal returns (uint256 newNumAddressesToDistributeTo) {
		(uint32 epoch, ) = _epoch();
		Cell memory cell = _cells[position];
		uint32 lastUpdate = cell.lastEpochUpdate;
		Color color = cell.color;
		uint8 life = cell.life;
		int8 delta = cell.delta;
		if (lastUpdate >= 1 && color != Color.None && life > 0) {
			// the cell is alive here
			(uint8 newLife, uint32 epochUsed) = _computeNewLife(lastUpdate, cell.enemymask, delta, life, epoch);
			cell.life = newLife;
			cell.lastEpochUpdate = epochUsed;
			if (newLife == 0) {
				// but not anymore here
				cell.delta = 0;
				// we thus distribute the tokens to enemy neighbours
				newNumAddressesToDistributeTo = _distributeDeath(
					transfers,
					numAddressesToDistributeTo,
					position,
					cell.enemymask,
					epochUsed
				);
			}
			_cells[position] = cell;
			// we keep the owner as it is used to compute winnings from this cell
			// alternative would be to always compute the 5 cells distribution
			// but the other 4 cell would have the same problem, they would be half computed anyway
		}
	}

	function _updateNeighbours(
		TokenTransfer[] memory transfers,
		uint256 numAddressesToDistributeTo,
		uint64 position,
		uint32 epoch,
		Color oldColor,
		Color newColor
	) internal returns (int8 newDelta, uint8 newEnemymask, uint256 newNumAddressesToDistributeTo) {
		unchecked {
			int256 x = int256(int32(int256(uint256(position) & 0xFFFFFFFF)));
			int256 y = int256(int32(int256(uint256(position) >> 32)));

			// console.log('%s => %s', uint8(oldColor), uint8(newColor));

			int8 enemyOrFriend;
			{
				uint64 upPosition = uint64((uint256(y - 1) << 32) + uint256(x));
				(enemyOrFriend, numAddressesToDistributeTo) = _updateCell(
					transfers,
					numAddressesToDistributeTo,
					upPosition,
					epoch,
					2,
					oldColor,
					newColor
				);
				if (enemyOrFriend < 0) {
					newEnemymask = newEnemymask | 1;
				}
				newDelta += enemyOrFriend;
			}
			{
				uint64 leftPosition = uint64((uint256(y) << 32) + uint256(x - 1));

				(enemyOrFriend, numAddressesToDistributeTo) = _updateCell(
					transfers,
					numAddressesToDistributeTo,
					leftPosition,
					epoch,
					3,
					oldColor,
					newColor
				);
				if (enemyOrFriend < 0) {
					newEnemymask = newEnemymask | 2;
				}
				newDelta += enemyOrFriend;
			}

			{
				uint64 downPosition = uint64((uint256(y + 1) << 32) + uint256(x));
				(enemyOrFriend, numAddressesToDistributeTo) = _updateCell(
					transfers,
					numAddressesToDistributeTo,
					downPosition,
					epoch,
					0,
					oldColor,
					newColor
				);
				if (enemyOrFriend < 0) {
					newEnemymask = newEnemymask | 4;
				}
				newDelta += enemyOrFriend;
			}
			{
				uint64 rightPosition = uint64((uint256(y) << 32) + uint256(x + 1));
				(enemyOrFriend, numAddressesToDistributeTo) = _updateCell(
					transfers,
					numAddressesToDistributeTo,
					rightPosition,
					epoch,
					1,
					oldColor,
					newColor
				);
				if (enemyOrFriend < 0) {
					newEnemymask = newEnemymask | 8;
				}
				newDelta += enemyOrFriend;
			}
		}
		newNumAddressesToDistributeTo = numAddressesToDistributeTo;
	}

	/// @dev This update the cell in storage
	function _updateCell(
		TokenTransfer[] memory transfers,
		uint256 numAddressesToDistributeTo,
		uint64 position,
		uint32 epoch,
		uint8 neighbourIndex,
		Color oldColor,
		Color newColor
	) internal returns (int8 enemyOrFriend, uint256 newNumAddressesToDistributeTo) {
		Cell memory cell = _cells[position];

		logger.logCell(1, '_updateCell', position, cell);

		// no need to call if oldColor == newColor, so we assume they are different
		assert(oldColor != newColor);
		uint32 lastUpdate = cell.lastEpochUpdate;
		Color color = cell.color;
		if (color != Color.None) {
			enemyOrFriend = color == newColor ? int8(1) : int8(-1);
		}

		// console.log(
		// 	'    enemyOrFriend: %s (%s => %s)',
		// 	Strings.toString(enemyOrFriend),
		// 	uint8(oldColor),
		// 	uint8(newColor)
		// );

		if (lastUpdate >= 1 && color != Color.None && cell.life > 0) {
			// we only consider cell with color that are not dead
			if (lastUpdate < epoch) {
				// of there is life to update we compute the new life
				(uint8 newLife, uint32 epochUsed) = _computeNewLife(
					lastUpdate,
					cell.enemymask,
					cell.delta,
					cell.life,
					epoch
				);

				// console.log('    newLife: %s ', newLife);
				// console.log('    epochUsed: %s ', epochUsed);

				if (newLife == 0) {
					// if dead, no need to update delta and enemymask
					numAddressesToDistributeTo = _updateCellAsDead(
						transfers,
						numAddressesToDistributeTo,
						position,
						cell,
						newLife,
						epochUsed
					);
				} else {
					// if not dead we update the delta and enemymask
					_updateCellFromNeighbor(position, cell, newLife, epoch, neighbourIndex, oldColor, newColor);
				}
			} else {
				// else if we simply update the delta and enemymask
				_updateCellFromNeighbor(position, cell, cell.life, epoch, neighbourIndex, oldColor, newColor);
			}
		}

		newNumAddressesToDistributeTo = numAddressesToDistributeTo;
	}

	function _updateCellAsDead(
		TokenTransfer[] memory transfers,
		uint256 numAddressesToDistributeTo,
		uint64 position,
		Cell memory cell,
		uint8 newLife,
		uint32 epochUsed
	) internal returns (uint256 newNumAddressesToDistributeTo) {
		cell.life = newLife;
		cell.lastEpochUpdate = epochUsed;
		cell.delta = 0;

		numAddressesToDistributeTo = _distributeDeath(
			transfers,
			numAddressesToDistributeTo,
			position,
			cell.enemymask,
			epochUsed
		);

		_cells[position] = cell;
		return numAddressesToDistributeTo;
	}

	function _updateCellFromNeighbor(
		uint64 position,
		Cell memory cell,
		uint8 newLife,
		uint32 epoch,
		uint8 neighbourIndex,
		Color oldColor,
		Color newColor
	) internal {
		if (newColor == Color.None) {
			// COLLISION, previous update added a color that should not be there
			if (cell.color == oldColor) {
				cell.delta -= 1;
			} else {
				cell.delta += 1;
				// remove enemy as it was added by COLLISION
				cell.enemymask = cell.enemymask & uint8((1 << neighbourIndex) ^ 0xFF);
			}
		} else if (cell.color == oldColor) {
			// then newColor is different (see assert above)
			cell.enemymask = cell.enemymask | uint8(1 << neighbourIndex);
			cell.delta -= 2;
		} else if (cell.color == newColor) {
			// then old color was different
			cell.delta += (oldColor == Color.None ? int8(1) : int8(2));
			cell.enemymask = cell.enemymask & uint8((1 << neighbourIndex) ^ 0xFF);

			logger.logCell(2, 'after neibhor change to a friendly color', position, cell);
		} else if (oldColor == Color.None) {
			// if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
			cell.delta -= 1;
			cell.enemymask = cell.enemymask | uint8(1 << neighbourIndex);
			logger.logCell(2, 'after neibhor change to a enemy color', position, cell);
		}
		cell.lastEpochUpdate = epoch;
		cell.life = newLife;
		_cells[position] = cell;

		logger.logCell(2, '_updateCellFromNeighbor', position, cell);
	}

	/// @dev this distribute the token in the cell who just died to the neighboring enemies that are still alive
	///  If none of the cell have living enemies, then the tokens are given back to the player
	function _distributeDeath(
		TokenTransfer[] memory transfers,
		uint256 numAddressesToDistributeTo,
		uint64 position,
		uint8 enemymask,
		uint32 epoch
	) internal view returns (uint256) {
		(address[4] memory enemies, uint8 numEnemiesAlive) = _getNeihbourEnemiesAliveWithPlayers(
			position,
			enemymask,
			epoch
		);
		uint256 total = NUM_TOKENS_PER_GEMS;

		if (numEnemiesAlive == 0) {
			return
				_collectTransfer(
					transfers,
					numAddressesToDistributeTo,
					TokenTransfer({to: payable(_owners[position]), amount: total})
				);
		}

		uint256 amountPerEnenies = total / numEnemiesAlive;
		for (uint8 i = 0; i < numEnemiesAlive; i++) {
			if (i == numEnemiesAlive - 1) {
				amountPerEnenies = total;
			}
			total -= amountPerEnenies;
			numAddressesToDistributeTo = _collectTransfer(
				transfers,
				numAddressesToDistributeTo,
				TokenTransfer({to: payable(enemies[i]), amount: amountPerEnenies})
			);
		}
		return numAddressesToDistributeTo;
	}

	function _collectTransfer(
		TokenTransfer[] memory collected,
		uint256 numAddressesToDistributeTo,
		TokenTransfer memory newTransfer
	) internal pure returns (uint256) {
		// we look for the newTransfer address in case it is already present
		for (uint256 k = 0; k < numAddressesToDistributeTo; k++) {
			if (collected[k].to == newTransfer.to) {
				// if we found we add the amount
				collected[k].amount += newTransfer.amount;
				// and return
				return numAddressesToDistributeTo;
			}
		}
		// if we did not find that address we add it to the end
		collected[numAddressesToDistributeTo].to = newTransfer.to;
		collected[numAddressesToDistributeTo].amount = newTransfer.amount;
		// and increase the size to lookup for next time
		numAddressesToDistributeTo++;
		return numAddressesToDistributeTo;
	}

	function _multiTransfer(TokenTransfer[] memory transfers, uint256 numAddressesToDistributeTo) internal {
		for (uint256 i = 0; i < numAddressesToDistributeTo; i++) {
			TOKENS.transfer(transfers[i].to, transfers[i].amount);
		}
	}
}

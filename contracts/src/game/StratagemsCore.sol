// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/ERC20/ERC2612/interfaces/IERC20WithIERC2612.sol';
import './IStratagems.sol';

contract StratagemsCore is IStratagemsCore {
	/// @notice The token used for the game. Each gems on the board contains that token
	IERC20WithIERC2612 internal immutable TOKENS;
	/// @notice the timestamp (in seconds) at which the game start, it start in the commit phase
	uint256 internal immutable START_TIME;
	/// @notice the duration of the commit phase in seconds
	uint256 internal immutable COMMIT_PHASE_DURATION;
	/// @notice the duration of the resolution phase in seconds
	uint256 internal immutable RESOLUTION_PHASE_DURATION;
	/// @notice the max number of level a cell can reach in the game
	uint8 internal immutable MAX_LIFE;
	/// @notice the number of tokens underlying each gems on the board.
	uint256 internal immutable NUM_TOKENS_PER_GEMS;
	/// @notice the address to send the token to when burning
	address payable internal immutable BURN_ADDRESS;

	/// @notice the number of moves a hash represent, after that players make use of furtherMoves
	uint8 internal constant NUM_MOVES_PER_HASH = 32;

	struct Config {
		IERC20WithIERC2612 tokens;
		address payable burnAddress;
		uint256 startTime;
		uint256 commitPhaseDuration;
		uint256 resolutionPhaseDuration;
		uint8 maxLife;
		uint256 numTokensPerGems;
	}

	/// @notice Create an instance of a Stratagems game
	/// @param config configuration options for the game
	constructor(Config memory config) {
		TOKENS = config.tokens;
		BURN_ADDRESS = config.burnAddress;
		START_TIME = config.startTime;
		COMMIT_PHASE_DURATION = config.commitPhaseDuration;
		RESOLUTION_PHASE_DURATION = config.resolutionPhaseDuration;
		MAX_LIFE = config.maxLife;
		NUM_TOKENS_PER_GEMS = config.numTokensPerGems;
	}

	/// @notice There is (2**128) * (2**128) cells
	mapping(uint256 => Cell) public cells;
	/// @notice the number of token in reserve per account
	///  This is used to slash player who do not resolve their commit
	///  The amount can be greater than the number of token required for the next move
	///  This allow player to potentially hide their intention.
	mapping(address => uint256) public tokensInReserve;
	/// @notice The commitment to be resolved. zeroed if no commitment need to be made.
	mapping(address => Commitment) public commitments;

	/// @notice called by players to add tokens to their reserve
	/// @param tokensAmountToAdd amount of tokens to add
	/// @param permit permit EIP2612, .value = zero if not needed
	function addToReserve(uint256 tokensAmountToAdd, Permit calldata permit) external {
		if (tokensAmountToAdd > 0) {
			uint256 newAmount = tokensInReserve[msg.sender];
			newAmount += tokensAmountToAdd;
			tokensInReserve[msg.sender] = newAmount;

			if (permit.value > 0) {
				TOKENS.permit(msg.sender, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
			}
			TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
			emit ReserveDeposited(msg.sender, tokensAmountToAdd, newAmount);
		}
	}

	/// @notice called by players to commit their moves
	///  this can be called multiple time, the last call overriding the previous.
	/// @param commitmentHash the hash of the moves
	function makeCommitment(bytes24 commitmentHash) external {
		_makeCommitment(msg.sender, commitmentHash, tokensInReserve[msg.sender]);
	}

	/// @notice called to make a commitment along with tokens to add to the reserve
	/// @param commitmentHash the has of the moves
	/// @param tokensAmountToAdd amount of tokens to add to the reserve. the resulting total must be enough to cover the moves
	/// @param permit permit EIP2612, value = zero if not needed
	function makeCommitmentWithExtraReserve(
		bytes24 commitmentHash,
		uint256 tokensAmountToAdd,
		Permit calldata permit
	) external {
		uint256 inReserve = tokensInReserve[msg.sender];
		inReserve += tokensAmountToAdd;
		tokensInReserve[msg.sender] = inReserve;

		_makeCommitment(msg.sender, commitmentHash, inReserve);

		if (permit.value > 0) {
			TOKENS.permit(msg.sender, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
		}

		if (tokensAmountToAdd > 0) {
			TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
			emit ReserveDeposited(msg.sender, tokensAmountToAdd, inReserve);
		}
	}

	/// @notice called by players to withdraw tokens from the reserve
	///  can only be called if no commitments are pending
	///  Note that while you can withdraw after commiting, note that if you do not have enough tokens
	///  you'll have your commitment failing.
	/// @param amount number of tokens to withdraw
	function withdrawFromReserve(uint256 amount) external {
		Commitment storage commitment = commitments[msg.sender];

		(uint32 epoch, bool commiting) = _epoch();

		require(commitment.epoch == 0 || (commiting && commitment.epoch == epoch), 'PREVIOUS_COMMITMENT_TO_RESOLVE');

		uint256 inReserve = tokensInReserve[msg.sender];
		if (amount == type(uint256).max) {
			amount = inReserve;
			inReserve = 0;
		} else {
			require(amount <= inReserve, 'NOT_ENOUGH');
			inReserve -= amount;
		}
		tokensInReserve[msg.sender] = inReserve;
		TOKENS.transfer(msg.sender, amount);
		emit ReserveWithdrawn(msg.sender, amount, inReserve);
	}

	/// @notice called by player to resolve their commitment
	///  this is where the core logic of the game takes place
	///  This is where the game board evolves
	///  The game is designed so that resolution order do not matter
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
	///  Note that you have to that number of mvoes
	function resolve(address player, bytes32 secret, Move[] calldata moves, bytes24 furtherMoves) external {
		Commitment storage commitment = commitments[player];
		(uint32 epoch, bool commiting) = _epoch();

		require(!commiting, 'IN_COMMITING_PHASE');
		require(commitment.epoch != 0, 'NOTHING_TO_RESOLVE');
		require(commitment.epoch == epoch, 'INVALID_EPOCH');

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		_resolveMoves(player, epoch, moves);

		bytes24 hashResolved = commitment.hash;
		if (furtherMoves != bytes24(0)) {
			require(moves.length == NUM_MOVES_PER_HASH, 'INVALID_FURTHER_MOVES');
			commitment.hash = furtherMoves;
		} else {
			commitment.epoch = 0; // used
		}

		emit CommitmentResolved(player, epoch, hashResolved, moves, furtherMoves);
	}

	/// @notice called by player if they missed the resolution phase and want to minimze the token loss
	///  By providing the moves, they will be slashed only the amount of token required to make the moves
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
	function acknowledgeMissedResolution(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves
	) external {
		Commitment storage commitment = commitments[player];
		(uint32 epoch, ) = _epoch();
		require(commitment.epoch > 0 && commitment.epoch != epoch, 'NO_NEED');

		uint256 numMoves = moves.length;

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		if (furtherMoves != bytes24(0)) {
			require(numMoves == NUM_MOVES_PER_HASH, 'INVALID_FURTHER_MOVES');
			commitment.hash = furtherMoves;
		} else {
			commitment.epoch = 0; // used
		}

		uint256 amount = moves.length;
		tokensInReserve[msg.sender] -= amount;
		TOKENS.transfer(BURN_ADDRESS, amount);
		emit CommitmentVoid(player, epoch, amount, furtherMoves);
	}

	/// @notice should only be called as last resort
	/// this will burn all tokens in reserve
	/// If player has access to the secret, better call acknowledgeMissedResolution
	function acknowledgeMissedResolutionByBurningAllReserve() external {
		Commitment storage commitment = commitments[msg.sender];
		(uint32 epoch, ) = _epoch();

		require(commitment.epoch > 0 && commitment.epoch != epoch, 'NO_NEED');
		commitment.epoch = 0;
		uint256 amount = tokensInReserve[msg.sender];
		tokensInReserve[msg.sender] = 0;
		TOKENS.transfer(BURN_ADDRESS, amount);

		// here we cannot know whether there were further move or even any moves
		// we just burn all tokens in reserve
		emit CommitmentVoid(msg.sender, epoch, amount, bytes24(0));
	}

	/// @notice poke a position, resolving its virtual state and if dead, reward neighboor enemies colors
	/// @param position the cell position
	function poke(uint64 position) external {
		(bool died, TokenTransfer[4] memory distribution) = _poke(position);
		if (died) {
			TokenTransfer[] memory transfers = new TokenTransfer[](4);
			_collectTransfers(transfers, 0, distribution);
			_multiTransfer(transfers);
		}
	}

	/// poke and collect the tokens won
	/// @param positions cell positions to collect from
	function pokeMultiple(uint64[] calldata positions) external {
		uint256 numCells = positions.length;
		TokenTransfer[] memory transfers = new TokenTransfer[](numCells * 4);
		uint256 offset = 0;
		for (uint256 i = 0; i < numCells; i++) {
			(bool died, TokenTransfer[4] memory distribution) = _poke(positions[i]);
			if (died) {
				offset = _collectTransfers(transfers, offset, distribution);
			}
		}
		_multiTransfer(transfers);
	}

	// --------------------------------------------------------------------------------------------
	// INTERNAL
	// --------------------------------------------------------------------------------------------

	function _poke(uint64 position) internal returns (bool died, TokenTransfer[4] memory distribution) {
		(uint32 epoch, ) = _epoch();
		Cell storage cell = cells[position];
		uint32 lastUpdate = cell.lastEpochUpdate;
		Color color = cell.color;
		uint8 life = cell.life;
		int8 delta = cell.delta;
		if (lastUpdate >= 1 && color != Color.None && life > 0) {
			(uint8 newLife, uint32 epochUsed) = _computeNewLife(lastUpdate, delta, life, epoch);
			cell.life = newLife;
			cell.lastEpochUpdate = epochUsed;
			if (newLife == 0) {
				cell.delta = 0;
				distribution = _getDeathDistribution(cell.owner, position, cell.enemymask, epochUsed);
				died = true;
			}
		}
	}

	function _makeCommitment(address player, bytes24 commitmentHash, uint256 inReserve) internal {
		Commitment storage commitment = commitments[player];

		(uint32 epoch, bool commiting) = _epoch();

		require(commiting, 'IN_RESOLUTION_PHASE');
		require(commitment.epoch == 0 || commitment.epoch == epoch, 'PREVIOUS_COMMITMENT_TO_RESOLVE');

		commitment.hash = commitmentHash;
		commitment.epoch = epoch;

		require(inReserve >= NUM_TOKENS_PER_GEMS, 'NEED_AT_LEAST_ONE_TOKEN_IN_RESERVE');

		emit CommitmentMade(player, epoch, commitmentHash);
	}

	function _resolveMoves(address player, uint32 epoch, Move[] memory moves) internal {
		uint256 tokensPlaced = 0;
		uint256 tokensBurnt = 0;
		for (uint256 i = 0; i < moves.length; i++) {
			(uint256 placed, uint256 burnt) = _computeMove(player, epoch, moves[i]);
			tokensPlaced += placed;
			tokensBurnt += burnt;
		}

		uint256 amountInReserve = tokensInReserve[player];

		// TODO add option to leave reserve alone
		// we still check reserve to ensure player cannot just cancel by having a small reserve
		// but using external fund might make a friendly experience to keep playing without adding to reserve
		require(amountInReserve >= tokensPlaced + tokensBurnt);
		amountInReserve -= tokensPlaced + tokensBurnt;
		tokensInReserve[player] = amountInReserve;

		if (tokensBurnt != 0) {
			TOKENS.transfer(BURN_ADDRESS, tokensBurnt);
		}
	}

	function _epoch() internal view virtual returns (uint32 epoch, bool commiting) {
		uint256 epochDuration = COMMIT_PHASE_DURATION + RESOLUTION_PHASE_DURATION;
		require(block.timestamp >= START_TIME, 'GAME_NOT_STARTED');
		uint256 timePassed = block.timestamp - START_TIME;
		epoch = uint32(timePassed / epochDuration + 1); // epoch start at 1
		commiting = timePassed - ((epoch - 1) * epochDuration) < COMMIT_PHASE_DURATION;
	}

	function _getNeihbourEnemiesWithPlayers(
		uint64 position,
		uint8 enemyMask
	) internal view returns (address[4] memory enemies, uint8 numEnemies) {
		unchecked {
			int256 x = int256(int32(int256(uint256(position) & 0xFFFFFFFF)));
			int256 y = int256(int32(int256(uint256(position) >> 32)));

			if (enemyMask & 1 == 1) {
				enemies[numEnemies] = cells[((uint256(y - 1) << 32) + uint256(x))].owner;
				numEnemies++;
			}
			if (enemyMask & (1 << 1) == (1 << 1)) {
				enemies[numEnemies] = cells[((uint256(y) << 32) + uint256(x - 1))].owner;
				numEnemies++;
			}
			if (enemyMask & (1 << 2) == (1 << 2)) {
				enemies[numEnemies] = cells[((uint256(y + 1) << 32) + uint256(x))].owner;
				numEnemies++;
			}
			if (enemyMask & (1 << 3) == (1 << 3)) {
				enemies[numEnemies] = cells[((uint256(y) << 32) + uint256(x + 1))].owner;
				numEnemies++;
			}
		}
	}

	function _getNeihbourEnemiesAliveWithPlayers(
		uint64 position,
		uint8 enemyMask,
		uint32 epoch
	) internal view returns (address[4] memory enemies, uint8 numEnemiesAlive) {
		unchecked {
			int256 x = int256(int32(int256(uint256(position) & 0xFFFFFFFF)));
			int256 y = int256(int32(int256(uint256(position) >> 32)));

			if (enemyMask & 1 == 1) {
				Cell memory cell = cells[((uint256(y - 1) << 32) + uint256(x))];
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = cell.owner;
					numEnemiesAlive++;
				}
			}
			if (enemyMask & (1 << 1) == (1 << 1)) {
				Cell memory cell = cells[((uint256(y) << 32) + uint256(x - 1))];
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = cell.owner;
					numEnemiesAlive++;
				}
			}
			if (enemyMask & (1 << 2) == (1 << 2)) {
				Cell memory cell = cells[((uint256(y + 1) << 32) + uint256(x))];
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = cell.owner;
					numEnemiesAlive++;
				}
			}
			if (enemyMask & (1 << 3) == (1 << 3)) {
				Cell memory cell = cells[((uint256(y) << 32) + uint256(x + 1))];
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = cell.owner;
					numEnemiesAlive++;
				}
			}
		}
	}

	function _checkHash(
		bytes24 commitmentHash,
		bytes32 secret,
		Move[] memory moves,
		bytes24 furtherMoves
	) internal pure {
		if (furtherMoves != bytes24(0)) {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves, furtherMoves)));
			require(commitmentHash == computedHash, 'HASH_NOT_MATCHING');
		} else {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves)));
			require(commitmentHash == computedHash, 'HASH_NOT_MATCHING');
		}
	}

	function _computeNewLife(
		uint32 lastUpdate,
		int8 delta,
		uint8 life,
		uint32 epoch
	) internal view returns (uint8 newLife, uint32 epochUsed) {
		if (lastUpdate >= 1 && life > 0) {
			uint256 epochDelta = epoch - lastUpdate;
			if (epochDelta > 0) {
				int8 effectiveDelta = delta != 0 ? delta : -1;
				if (effectiveDelta > 0) {
					if (life < MAX_LIFE) {
						uint8 maxEpoch = ((MAX_LIFE - life) + uint8(effectiveDelta) - 1) / uint8(effectiveDelta);
						if (epochDelta > maxEpoch) {
							epochDelta = maxEpoch;
						}

						life += uint8(epochDelta) * uint8(effectiveDelta);
						if (life > MAX_LIFE) {
							life = MAX_LIFE;
						}
						newLife = life;
						epochUsed = lastUpdate + uint32(epochDelta);
					}
				} else if (effectiveDelta < 0) {
					uint8 numEpochBeforeDying = (life + uint8(-effectiveDelta) - 1) / uint8(-effectiveDelta);
					if (epochDelta > numEpochBeforeDying) {
						epochDelta = numEpochBeforeDying;
					}
					uint8 lifeLoss = uint8(epochDelta) * uint8(-effectiveDelta);
					if (lifeLoss > life) {
						newLife = 0;
					} else {
						newLife = life - lifeLoss;
					}
					epochUsed = lastUpdate + uint32(epochDelta);
				}
			}
		}
	}

	function _getUpdatedCell(uint64 position, uint32 epoch) internal view returns (Cell memory updatedCell) {
		// load from state
		updatedCell = cells[position];
		uint32 lastUpdate = updatedCell.lastEpochUpdate;
		int8 delta = updatedCell.delta;
		uint8 life = updatedCell.life;
		if (lastUpdate >= 1 && life > 0) {
			(uint8 newLife, uint32 epochUsed) = _computeNewLife(lastUpdate, delta, life, epoch);
			if (newLife == 0) {
				updatedCell.delta = 0;
			}
			updatedCell.life = newLife;
			updatedCell.lastEpochUpdate = epochUsed;
		}
	}

	function _updateCell(
		uint64 position,
		uint32 epoch,
		uint8 neighbourIndex,
		Color oldColor,
		Color newColor
	) internal returns (int8 enemyOrFriend) {
		Cell storage cell = cells[position];

		// no need to call if oldColor == newColor, so we assume they are different
		assert(oldColor != newColor);
		uint32 lastUpdate = cell.lastEpochUpdate;
		Color color = cell.color;
		enemyOrFriend = color == newColor ? int8(1) : int8(-1);

		if (lastUpdate >= 1 && color != Color.None && cell.life > 0) {
			int8 delta = cell.delta;
			uint8 enemymask = cell.enemymask;
			(uint8 newLife, uint32 epochUsed) = _computeNewLife(lastUpdate, delta, cell.life, epoch);

			if (newLife == 0) {
				cell.life = newLife;
				cell.lastEpochUpdate = epochUsed;
				cell.delta = 0;
				TokenTransfer[4] memory transfers4 = _getDeathDistribution(cell.owner, position, enemymask, epochUsed);
				TokenTransfer[] memory transfers = new TokenTransfer[](4);
				_collectTransfers(transfers, 0, transfers4);
				_multiTransfer(transfers);
			} else {
				if (newColor == Color.None) {
					// COLLISION, previous update added a color that should not be there
					if (color == oldColor) {
						delta -= 1;
					} else {
						delta += 1;
						// remove enemy as it was added by COLLISION
						enemymask = enemymask & uint8((1 << neighbourIndex) ^ 0xFF);
					}
				} else if (color == oldColor) {
					// then newColor is different (see assert above)
					enemymask = enemymask | uint8(1 << neighbourIndex);
					delta -= 2;
				} else if (color == newColor) {
					// then old color was different
					delta += (oldColor == Color.None ? int8(1) : int8(2));
					enemymask = enemymask & uint8((1 << neighbourIndex) ^ 0xFF);
				} else if (oldColor == Color.None) {
					// if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
					delta -= 1;
					enemymask = enemymask | uint8(1 << neighbourIndex);
				}
				cell.delta = delta;
				cell.lastEpochUpdate = epoch;
				cell.life = newLife;
			}
		}
	}

	function _collectTransfers(
		TokenTransfer[] memory collected,
		uint256 offset,
		TokenTransfer[4] memory transfers
	) internal pure returns (uint256 newOffset) {
		collected[offset].to = transfers[0].to;
		collected[offset].amount = transfers[0].amount;
		newOffset = offset;
		for (uint256 i = 1; i < 4; i++) {
			if (transfers[i].to == address(0)) {
				continue;
			}
			if (collected[offset].to == address(0)) {
				collected[offset].to = transfers[i].to;
				collected[offset].amount = transfers[i].amount;
				newOffset = offset + 1;
			} else if (transfers[i].to == collected[offset].to) {
				collected[offset].amount += transfers[i].amount;
			} else if (collected[offset + 1].to == address(0)) {
				collected[offset + 1].to = transfers[i].to;
				collected[offset + 1].amount = transfers[i].amount;
				newOffset = offset + 2;
			} else if (transfers[i].to == collected[offset + 1].to) {
				collected[offset + 1].amount += transfers[i].amount;
			} else if (collected[offset + 2].to == address(0)) {
				collected[offset + 2].to = transfers[i].to;
				collected[offset + 2].amount = transfers[i].amount;
				newOffset = offset + 3;
			} else if (transfers[i].to == collected[offset + 2].to) {
				collected[offset + 2].amount += transfers[i].amount;
			} else if (collected[offset + 3].to == address(0)) {
				collected[offset + 3].to = transfers[i].to;
				collected[offset + 3].amount = transfers[i].amount;
				newOffset = offset + 4;
			} else {
				// if (transfers[i].to == collected[offset+3].to) {
				collected[offset + 3].amount += transfers[i].amount;
			}
		}
	}

	function _multiTransfer(TokenTransfer[] memory transfers) internal {
		for (uint256 i = 0; i < transfers.length; i++) {
			if (transfers[i].to != address(0)) {
				TOKENS.transfer(transfers[i].to, transfers[i].amount);
			} else {
				// we break on zero address
				break;
			}
		}
	}

	function _getDeathDistribution(
		address cellOwner,
		uint64 position,
		uint8 enemymask,
		uint32 epoch
	) internal view returns (TokenTransfer[4] memory transfers) {
		(address[4] memory enemies, uint8 numEnemiesAlive) = _getNeihbourEnemiesAliveWithPlayers(
			position,
			enemymask,
			epoch
		);
		uint256 total = NUM_TOKENS_PER_GEMS;

		if (numEnemiesAlive == 0) {
			transfers[0] = TokenTransfer({to: payable(cellOwner), amount: total});
			return transfers;
		}

		uint256 amountPerEnenies = total / numEnemiesAlive;
		for (uint8 i = 0; i < numEnemiesAlive; i++) {
			if (i == numEnemiesAlive - 1) {
				amountPerEnenies = total;
			}
			transfers[i] = TokenTransfer({to: payable(enemies[i]), amount: amountPerEnenies});
			total -= amountPerEnenies;
		}
	}

	function _updateNeighbours(
		uint64 position,
		uint32 epoch,
		Color oldColor,
		Color newColor
	) internal returns (int8 newDelta) {
		unchecked {
			int256 x = int256(int32(int256(uint256(position) & 0xFFFFFFFF)));
			int256 y = int256(int32(int256(uint256(position) >> 32)));
			uint64 upPosition = uint64((uint256(y - 1) << 32) + uint256(x));
			uint64 leftPosition = uint64((uint256(y) << 32) + uint256(x - 1));
			uint64 downPosition = uint64((uint256(y + 1) << 32) + uint256(x));
			uint64 rightPosition = uint64((uint256(y) << 32) + uint256(x + 1));

			newDelta =
				_updateCell(upPosition, epoch, 0, oldColor, newColor) +
				_updateCell(leftPosition, epoch, 1, oldColor, newColor) +
				_updateCell(downPosition, epoch, 2, oldColor, newColor) +
				_updateCell(rightPosition, epoch, 3, oldColor, newColor);
		}
	}

	// Note on COLLISION
	// we could order color in a certain way so one color takes precedence over another
	// And if the same color was used, we could consider the cell having N owner and N times the number of tokens
	// such cells would be a good target for others
	// On the other end,  on winning agains other cells, owner of such cell would have to divide the winnings
	function _computeMove(
		address player,
		uint32 epoch,
		Move memory move
	) internal returns (uint256 tokensPlaced, uint256 tokensBurnt) {
		Cell memory currentState = _getUpdatedCell(move.position, epoch);
		// TODO Make it real, store the result and potential death distribution

		if (currentState.epochWhenTokenIsAdded == epoch) {
			// COLLISION
			// you get your token back
			// the other player too
			if (currentState.life != 0) {
				_updateNeighbours(move.position, epoch, currentState.color, Color.None);

				// giving back
				tokensInReserve[currentState.owner] += NUM_TOKENS_PER_GEMS;

				currentState.life = 0;
				currentState.color = Color.None;
				currentState.owner = address(0);
				currentState.lastEpochUpdate = 0;
				currentState.delta = 0;
				currentState.enemymask = 0;
				cells[move.position] = currentState;
			} else {
				// we skip
				// tokensPlaced = 0 so this is not counted
			}
		} else if (currentState.life == 0) {
			currentState.life = 1;
			currentState.owner = player;
			currentState.epochWhenTokenIsAdded = epoch;
			currentState.lastEpochUpdate = epoch;

			if (currentState.color != move.color) {
				// only update neighbour if color changed
				_updateNeighbours(move.position, epoch, currentState.color, move.color);
				currentState.color = move.color;
				// TODO fetch neighbours to compute delta
				currentState.delta = 0;
				currentState.enemymask = 0;
			} else {
				// TODO fetch neighbours to compute delta
				currentState.delta = 0;
				currentState.enemymask = 0;
			}

			tokensPlaced = NUM_TOKENS_PER_GEMS;
			cells[move.position] = currentState;
		} else {
			// invalid move
			tokensBurnt = NUM_TOKENS_PER_GEMS;
		}
	}
}

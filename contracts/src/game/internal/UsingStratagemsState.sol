// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './UsingStratagemsStore.sol';
import '../interface/UsingStratagemsEvents.sol';
import './UsingVirtualTime.sol';

// TODO use hardhat-preprocessor
import 'hardhat/console.sol';
import '@openzeppelin/contracts/utils/Strings.sol';

library logger {
	address constant CONSOLE_ADDRESS = 0x000000000000000000636F6e736F6c652e6c6f67;

	function _sendLogPayload(bytes memory payload) private view {
		address consoleAddress = CONSOLE_ADDRESS;
		/// @solidity memory-safe-assembly
		assembly {
			pop(staticcall(gas(), consoleAddress, add(payload, 32), mload(payload), 0, 0))
		}
	}

	// _sendLogPayload(abi.encodeWithSignature('log(string,int256,int256)', 'cell %s', x, y));

	function logCell(uint8 i, string memory title, uint64 id, UsingStratagemsTypes.Cell memory cell) internal view {
		string memory indent = i == 0 ? '' : i == 1 ? '    ' : i == 2 ? '        ' : '            ';
		console.log('%s%s', indent, title);
		int256 x = int256(int32(int256(uint256(id) & 0xFFFFFFFF)));
		int256 y = int256(int32(int256(uint256(id) >> 32)));
		console.log('%s-------------------------------------------------------------', indent);
		console.log('%scell (%s,%s)', indent, Strings.toString(x), Strings.toString(y));
		console.log('%s-------------------------------------------------------------', indent);
		console.log('%s - lastEpochUpdate:  %s', indent, cell.lastEpochUpdate);
		console.log('%s - epochWhenTokenIsAdded:  %s', indent, cell.epochWhenTokenIsAdded);
		console.log('%s - color:  %s', indent, uint8(cell.color));
		console.log('%s - life:  %s', indent, cell.life);
		console.log('%s - delta: %s', indent, Strings.toString(cell.delta));
		console.log('%s - enemymask:  %s', indent, cell.enemymask);
		console.log('%s-------------------------------------------------------------', indent);
	}
}

abstract contract UsingStratagemsState is UsingStratagemsStore, UsingStratagemsEvents, UsingVirtualTime {
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
	uint8 internal constant NUM_MOVES_PER_HASH = 16;

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

	function _epoch() internal view virtual returns (uint32 epoch, bool commiting) {
		uint256 epochDuration = COMMIT_PHASE_DURATION + RESOLUTION_PHASE_DURATION;
		uint256 time = _timestamp();
		console.log('time %s', time);
		require(time >= START_TIME, 'GAME_NOT_STARTED');
		uint256 timePassed = time - START_TIME;
		console.log('timePassed %s', timePassed);
		epoch = uint32(timePassed / epochDuration + 2); // epoch start at 2, this make the hypothetical previous resolution phase's epoch to be 1
		console.log('epoch %s', epoch);
		commiting = timePassed - ((epoch - 2) * epochDuration) < COMMIT_PHASE_DURATION;
		console.log('commiting %s', commiting);
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
				uint256 cellPos = ((uint256(y - 1) << 32) + uint256(x));
				Cell memory cell = _getUpdatedCell(uint64(cellPos), epoch);
				// we consider cells to be alive either because
				// their life > 0 after being updated
				// or that their last death update is the same epoch
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = _owners[cellPos];
					numEnemiesAlive++;
				}
			}
			if (enemyMask & 2 == 2) {
				uint256 cellPos = ((uint256(y) << 32) + uint256(x - 1));
				Cell memory cell = _getUpdatedCell(uint64(cellPos), epoch);
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = _owners[cellPos];
					numEnemiesAlive++;
				}
			}
			if (enemyMask & 4 == 4) {
				uint256 cellPos = ((uint256(y + 1) << 32) + uint256(x));
				Cell memory cell = _getUpdatedCell(uint64(cellPos), epoch);
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = _owners[cellPos];
					numEnemiesAlive++;
				}
			}
			if (enemyMask & 8 == 8) {
				uint256 cellPos = ((uint256(y) << 32) + uint256(x + 1));
				Cell memory cell = _getUpdatedCell(uint64(cellPos), epoch);
				if (cell.life > 0 || cell.lastEpochUpdate == epoch) {
					enemies[numEnemiesAlive] = _owners[cellPos];
					numEnemiesAlive++;
				}
			}
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
				// TODO delta is allowed to be zero if no enemy (take enemymask as input too)
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
					} else {
						newLife = life;
						epochUsed = lastUpdate;
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
				} else {
					newLife = life;
					epochUsed = lastUpdate;
				}
			} else {
				newLife = life;
				epochUsed = lastUpdate;
			}
		}
	}

	function _getUpdatedCell(uint64 position, uint32 epoch) internal view returns (Cell memory updatedCell) {
		// load from state
		updatedCell = _cells[position];
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
}

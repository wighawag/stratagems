// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/IStratagems.sol';
import '../internal/UsingStratagemsState.sol';

contract StratagemsGetters is IStratagemsGetters, UsingStratagemsState {
	constructor(Config memory config) UsingStratagemsState(config) {}

	/// @inheritdoc IStratagemsGetters
	function getCell(uint256 id) external view returns (FullCell memory) {
		(uint24 epoch, ) = _epoch();
		// console.log('epoch %s', epoch);
		Cell memory updatedCell = _getUpdatedCell(uint64(id), epoch);
		return
			FullCell({
				owner: _ownerOf(id),
				lastEpochUpdate: updatedCell.lastEpochUpdate,
				epochWhenTokenIsAdded: updatedCell.epochWhenTokenIsAdded,
				color: updatedCell.color,
				life: updatedCell.life,
				delta: updatedCell.delta,
				enemyMap: updatedCell.enemyMap,
				distribution: updatedCell.distribution
			});
	}

	/// @inheritdoc IStratagemsGetters
	function getCells(uint256[] memory ids) external view returns (FullCell[] memory cells) {
		(uint24 epoch, ) = _epoch();
		uint256 numCells = ids.length;
		cells = new FullCell[](numCells);
		for (uint256 i = 0; i < numCells; i++) {
			Cell memory updatedCell = _getUpdatedCell(uint64(ids[i]), epoch);
			cells[i] = FullCell({
				owner: _ownerOf(ids[i]),
				lastEpochUpdate: updatedCell.lastEpochUpdate,
				epochWhenTokenIsAdded: updatedCell.epochWhenTokenIsAdded,
				color: updatedCell.color,
				life: updatedCell.life,
				delta: updatedCell.delta,
				enemyMap: updatedCell.enemyMap,
				distribution: updatedCell.distribution
			});
		}
	}

	/// @inheritdoc IStratagemsGetters
	function getTokensInReserve(address account) external view returns (uint256 amount) {
		return _tokensInReserve[account];
	}

	/// @inheritdoc IStratagemsGetters
	function getCommitment(address account) external view returns (Commitment memory commitment) {
		return _commitments[account];
	}

	/// @inheritdoc IStratagemsGetters
	function getConfig() external view returns (Config memory config) {
		config.tokens = TOKENS;
		config.burnAddress = BURN_ADDRESS;
		config.startTime = START_TIME;
		config.commitPhaseDuration = COMMIT_PHASE_DURATION;
		config.revealPhaseDuration = REVEAL_PHASE_DURATION;
		config.maxLife = MAX_LIFE;
		config.numTokensPerGems = NUM_TOKENS_PER_GEMS;
	}

}
// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsState.sol";

contract StratagemsGetters is IStratagemsGetters, UsingStratagemsState {
    constructor(Config memory config) UsingStratagemsState(config) {}

    /// @inheritdoc IStratagemsGetters
    function getCell(uint256 id) external view returns (FullCell memory) {
        (uint24 cycle, ) = _currentCycle();
        return _fullCell(id, cycle);
    }

    /// @inheritdoc IStratagemsGetters
    function getCells(uint256[] memory ids) external view returns (FullCell[] memory cells) {
        (uint24 cycle, ) = _currentCycle();
        uint256 numCells = ids.length;
        cells = new FullCell[](numCells);
        for (uint256 i = 0; i < numCells; i++) {
            cells[i] = _fullCell(ids[i], cycle);
        }
    }

    /// @inheritdoc IStratagemsGetters
    function getReserve(uint256 player) external view returns (uint256 amount) {
        return _reserveOf(player);
    }

    /// @inheritdoc IStratagemsGetters
    function getCommitment(uint256 player) external view returns (Commitment memory commitment) {
        return _commitmentOf(player);
    }

    /// @inheritdoc IStratagemsGetters
    function getConfig() external view returns (Config memory config) {
        config = Config({
            tokens: TOKENS,
            burnAddress: BURN_ADDRESS,
            startTime: START_TIME,
            commitPhaseDuration: COMMIT_PHASE_DURATION,
            revealPhaseDuration: REVEAL_PHASE_DURATION,
            maxLife: MAX_LIFE,
            numTokensPerGems: NUM_TOKENS_PER_GEMS,
            time: TIME,
            generator: GENERATOR,
            actionsPerReveal: ACTIONS_PER_REVEAL,
            cyclePolicy: CYCLE_POLICY
        });
    }

    /// @inheritdoc IStratagemsGetters
    function getCycleNumber() external view returns (uint64 cycleNumber, bool commiting) {
        return _cycleNumber();
    }

    /// @inheritdoc IStratagemsGetters
    function getCycle() external view returns (Cycle memory cycle) {
        return _cycle();
    }

    /// @inheritdoc IStratagemsGetters
    function getAttendance() external view returns (Attendance memory attendance) {
        (uint64 cycleNumber, ) = _cycleNumber();
        return _attendance(cycleNumber);
    }

    function _fullCell(uint256 id, uint24 cycle) internal view returns (FullCell memory) {
        (Cell memory updatedCell, ) = _getUpdatedCell(uint64(id), cycle);
        return
            FullCell({
                owner: _ownerOf(id),
                lastCycleUpdate: updatedCell.lastCycleUpdate,
                cycleWhenTokenIsAdded: updatedCell.cycleWhenTokenIsAdded,
                producingCycles: updatedCell.producingCycles,
                color: updatedCell.color,
                life: updatedCell.life,
                delta: updatedCell.delta,
                enemyMap: updatedCell.enemyMap,
                distribution: updatedCell.distribution,
                stake: updatedCell.stake
            });
    }
}

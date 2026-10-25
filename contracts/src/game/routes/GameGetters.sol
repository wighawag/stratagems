// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../internal/UsingGameInternal.sol";
import "../interfaces/IGame.sol";

contract GameGetters is IGameGetters, UsingGameInternal {
    constructor(Config memory config) UsingGameInternal(config) {}

    /// @inheritdoc IGameGetters
    function getCycleNumber()
        external
        view
        returns (uint64 cycleNumber, bool commiting)
    {
        return _cycleNumber();
    }

    /// @inheritdoc IGameGetters
    function getCycle() external view returns (Cycle memory cycle) {
        return _cycle();
    }

    /// @inheritdoc IGameGetters
    function getAttendance()
        external
        view
        returns (Attendance memory attendance)
    {
        (uint64 cycleNumber, ) = _cycleNumber();
        return _attendance(cycleNumber);
    }

    /// @inheritdoc IGameGetters
    function getCommitment(
        uint256 player
    ) external view returns (Commitment memory commitment) {
        return _commitmentOf(player);
    }

    /// @inheritdoc IGameGetters
    function getReserve(uint256 player) external view returns (uint256 amount) {
        return _reserveOf(player);
    }

    /// @inheritdoc IGameGetters
    function getConfig() external view returns (Config memory config) {
        config = Config({
            startTime: START_TIME,
            commitPhaseDuration: COMMIT_PHASE_DURATION,
            revealPhaseDuration: REVEAL_PHASE_DURATION,
            time: TIME,
            tokens: TOKENS,
            placementCost: PLACEMENT_COST,
            actionsPerReveal: ACTIONS_PER_REVEAL,
            cyclePolicy: CYCLE_POLICY
        });
    }

    /// @inheritdoc IGameGetters
    function getCell(uint64 cellID) external view returns (Cell memory cell) {
        return _cells[cellID];
    }

    /// @inheritdoc IGameGetters
    function getStakeOnCell(
        uint64 cellID,
        uint256 player
    ) external view returns (uint256 stake) {
        return _stakeOnCellBy[cellID][player];
    }

    /// @inheritdoc IGameGetters
    function getCellsInZone(
        uint64 zone
    ) external view returns (CellAt[] memory cells, uint64 cycleNumber) {
        uint64[] memory zones = new uint64[](1);
        zones[0] = zone;
        return _cellsInZones(zones);
    }

    /// @inheritdoc IGameGetters
    function getCellsInZones(
        uint64[] calldata zones
    ) external view returns (CellAt[] memory cells, uint64 cycleNumber) {
        return _cellsInZones(zones);
    }

    /// @dev Reads the zone's index of claimed cells, so the work is what the
    ///      board actually HOLDS there and not a flat 16x16 per zone.
    ///
    ///      This used to walk all 256 slots of every zone asked for, twice.
    ///      That made an empty viewport cost exactly as much as a full one and
    ///      put the wall in the wrong place: on a stock node the request
    ///      exceeded the `eth_call` gas cap at 14 zones while a camera at
    ///      default zoom already asked for 15, and because the Game sits
    ///      behind a router the failure surfaced as "function selector was not
    ///      recognized" rather than as anything resembling out-of-gas. It also
    ///      cost real time on a local node - about 280ms for 8 empty zones -
    ///      which is enough for a few browsers polling their viewport to
    ///      saturate a single-threaded dev chain and stall every other call
    ///      made against it.
    ///
    ///      A view call's cost is the caller's and is not paid on chain, which
    ///      is why this was survivable, not why it was acceptable.
    function _cellsInZones(
        uint64[] memory zones
    ) internal view returns (CellAt[] memory cells, uint64 cycleNumber) {
        (cycleNumber, ) = _cycleNumber();

        // Every indexed cell is a claimed cell, so the count is known up front
        // and there is nothing to filter.
        uint256 found = 0;
        for (uint256 z = 0; z < zones.length; z++) {
            found += _occupiedCellsInZone[zones[z]].length;
        }

        cells = new CellAt[](found);
        uint256 n = 0;
        for (uint256 z = 0; z < zones.length; z++) {
            uint64[] storage occupied = _occupiedCellsInZone[zones[z]];
            for (uint256 i = 0; i < occupied.length; i++) {
                uint64 cellID = occupied[i];
                Cell storage cell = _cells[cellID];
                cells[n] = CellAt({
                    cellID: cellID,
                    totalStake: cell.totalStake,
                    numClaimants: cell.numClaimants
                });
                n++;
            }
        }
    }
}

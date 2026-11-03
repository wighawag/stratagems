// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "./UsingStratagemsTableScore.sol";

/// @title A table's own route: its board, its settlement and its winners
/// @dev Only the table implementation has it, beside the base's
///      `CommitRevealLobby` (`021_deploy_tables.ts`); the world has no such
///      route, and nothing here is reachable there.
///
///      THE SETTLEMENT (L4-14) is the final board made real: after the end the
///      board's cycle is `lastCycleNumber + MAX_LIFE` ({UsingStratagemsTable-_currentCycle}),
///      where every cell is at full life or dead, so poking a cell there pays
///      what its death owes, exactly as playing those cycles out would have
///      (`Stratagems.poke.test.ts`). A survivor's stake then goes back to its
///      owner's reserve. A settled cell keeps its colour, owner and life, so the
///      final board stays readable; its stake is set to zero, which is what
///      marks it settled. Anyone may settle, in batches, and the call that
///      settles the last cell records every member's score and the winners.
contract StratagemsTable is UsingStratagemsTableScore {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @notice Settle `positions` after the end; the last one also finalises the table.
    /// @dev A position empty or already settled is skipped, so a batch may
    ///      overlap another. Finalising is refused while a member's commitment
    ///      is open: a missed reveal is settled first (by anyone shown the
    ///      chunks, or by the player), since its forfeit is part of the score.
    function settle(uint64[] calldata positions) external {
        if (!_hasEnded()) {
            revert TableNotEnded();
        }
        TableLayout storage $ = _table();
        (uint24 cycle, ) = _currentCycle();
        uint256 numPositions = positions.length;
        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](numPositions * 5 + 1),
            numTransfers: 0
        });
        uint256 settledNow = 0;
        for (uint256 i = 0; i < numPositions; i++) {
            uint64 position = positions[i];
            Cell memory cell = _cells[position];
            if (cell.color == Color.None || cell.stake == 0) {
                continue;
            }
            _poke(transferCollection, position, cycle);
            cell = _cells[position];
            if (cell.life != 0) {
                _collectTransfer(
                    transferCollection,
                    TokenTransfer({to: payable(_ownerOf(position)), amount: uint256(cell.stake) * NUM_TOKENS_PER_GEMS})
                );
            }
            cell.stake = 0;
            _cells[position] = cell;
            settledNow++;
        }
        _multiTransfer(TOKENS, transferCollection);
        if (settledNow != 0) {
            $.unsettledCells -= settledNow;
            _emitCellsWritten(cycle, positions);
        }
        if ($.unsettledCells == 0 && !$.settled) {
            _finalise($);
        }
    }

    /// @notice The square a move must land in, inclusive; all zero before the start.
    function getBoard() external view returns (int32 min, int32 max, uint256 side) {
        return _boardBounds();
    }

    /// @notice The table's options: the stake of a seat and the board's gap.
    function getTableOptions() external view returns (uint256 stakeTokens, uint32 stakeGems, uint16 gapPercent) {
        return _tableOptions();
    }

    /// @notice How many cells still hold a stake; zero once settled (and on an empty board).
    function unsettledCells() external view returns (uint256) {
        return _table().unsettledCells;
    }

    /// @notice What collisions cost `player`, in tokens: added back to their score.
    function getCollisionCredit(uint256 player) external view returns (uint256) {
        return _table().collisionCredit[player];
    }

    /// @notice Whether the table has been settled, which is when its scores are final.
    function isSettled() external view returns (bool) {
        return _table().settled;
    }

    /// @notice Every member at the settlement, and their score in tokens (net gems).
    function getScores() external view returns (uint256[] memory players, int256[] memory scores) {
        TableLayout storage $ = _table();
        return ($.players, $.scores);
    }

    /// @notice The members with the highest score; several on a tie, none before the settlement.
    function winners() external view returns (uint256[] memory) {
        return _table().winners;
    }

    /// @dev THE SCORE IS THE RESERVE ONCE SETTLED (L4-13): every payout and
    ///      every survivor's stake has been credited to it, every placement and
    ///      forfeit taken from it, so the reserve less the stake is what the
    ///      game gave or took, and a collision's credit makes it neutral. A
    ///      member forfeited during the game is no candidate: only `_members()`.
    function _finalise(TableLayout storage $) internal {
        uint256[] memory members = _members();
        uint256 numMembers = members.length;
        (uint256 stakeTokens, , ) = _tableOptions();
        int256[] memory scores = new int256[](numMembers);
        int256 topScore = type(int256).min;
        uint256 numWinners = 0;
        for (uint256 i = 0; i < numMembers; i++) {
            uint256 player = members[i];
            if (_commitmentOf(player).cycleNumber != 0) {
                revert TableCommitmentOpen(player);
            }
            int256 score = int256(_reserveOf(player)) - int256(stakeTokens) + int256($.collisionCredit[player]);
            scores[i] = score;
            if (score > topScore) {
                topScore = score;
                numWinners = 1;
            } else if (score == topScore) {
                numWinners++;
            }
        }
        uint256[] memory best = new uint256[](numWinners);
        uint256 k = 0;
        for (uint256 i = 0; i < numMembers; i++) {
            if (scores[i] == topScore) {
                best[k++] = members[i];
            }
        }
        $.players = members;
        $.scores = scores;
        $.winners = best;
        $.settled = true;
        emit TableSettled(best, numMembers == 0 ? int256(0) : topScore);
    }
}

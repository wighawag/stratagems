// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../internal/UsingStratagemsState.sol";

/// @title What a TABLE adds to stratagems' rules: a fixed stake, a closed
///        economy, a board sized to the gems, an end and a score
/// @dev THE PERSISTENT WORLD NEVER INHERITS THIS (the plan's step L4, L4-13):
///      only the table implementation's routes do, so the world's routes are
///      compiled exactly as before, and every hook below is an override of an
///      internal virtual function, resolved at compile time.
///
///      - A FIXED STAKE (L4-23): `gameOptions` (the base stores it, opaque) is
///        `{uint32 stakeGems; uint16 gapPercent}` in its low 48 bits, the rest
///        zero. A seat stakes exactly `stakeGems` gems, once; no top-up, and no
///        withdrawal between the start and the settlement.
///      - A CLOSED ECONOMY (L4-23): every payout and every removal's gem is
///        CREDITED TO THE RECIPIENT'S RESERVE ({_multiTransfer}), the tokens
///        staying here, so the gems in play are the members' stakes less what
///        is burnt (a forfeit) or lost to Evil. A payout to `EVIL_OWNER` is
///        still sent there.
///      - A BOARD SIZED TO THE GEMS (L4-24): a square centred on the origin,
///        side `ceil(sqrt(startedWith * stakeGems * (100 + gap) / 100))`; a
///        move outside it is skipped ({_computeMove}).
///      - THE END (L4-3, L4-14): after the table's last cycle the BOARD's cycle
///        is pinned at `lastCycleNumber + MAX_LIFE` ({_currentCycle}), where
///        every cell is at full life or dead whatever the clock says
///        (`Stratagems.poke.test.ts`), so a poke, a settlement and a read after
///        the end all see the final board. The base's cycle is untouched.
///      - THE SCORE (L4-13, L4-16): once settled, a member's reserve, minus
///        their stake, plus what collisions cost them ({_completeMove}).
abstract contract UsingStratagemsTable is UsingStratagemsState {
    /// @notice the options are not `{uint32 stakeGems; uint16 gapPercent}`, or stake no gem
    error InvalidTableOptions(bytes32 gameOptions);
    /// @notice a seat stakes exactly the table's amount, once, before the start
    error TableStakeIsFixed(uint256 expected, uint256 given);
    /// @notice a member's reserve stays at the table from its start until it is settled
    error TableNotSettled();
    /// @notice the table has not played its last cycle yet
    error TableNotEnded();
    /// @notice a member's commitment is still open: settle its missed reveal first
    error TableCommitmentOpen(uint256 player);

    /// @notice The table was settled: every cell paid out, every score recorded.
    event TableSettled(uint256[] winners, int256 topScore);

    /// @custom:storage-location erc7201:stratagems.storage.Table
    struct TableLayout {
        /// @notice how many cells hold a colour and a stake not yet settled
        uint256 unsettledCells;
        /// @notice what collisions cost each player, in tokens (L4-16)
        mapping(uint256 player => uint256 amount) collisionCredit;
        bool settled;
        /// @notice the members at the settlement, and their scores, in order
        uint256[] players;
        int256[] scores;
        uint256[] winners;
    }

    /// keccak256(abi.encode(uint256(keccak256("stratagems.storage.Table")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant TABLE_STORAGE_LOCATION =
        0x6a3aa4f186150d1b672e7fbfd4fa78e71216c64a4c53f60fc2170bdec148a000;

    function _table() internal pure returns (TableLayout storage $) {
        assembly {
            $.slot := TABLE_STORAGE_LOCATION
        }
    }

    //-------------------------------------------------------------------------
    // THE OPTIONS
    //-------------------------------------------------------------------------

    /// @return stakeTokens what a seat stakes, in tokens
    /// @return stakeGems the same in gems
    /// @return gapPercent how much bigger than one cell per gem the board is
    function _tableOptions() internal view returns (uint256 stakeTokens, uint32 stakeGems, uint16 gapPercent) {
        bytes32 options = _gameOptions();
        uint256 raw = uint256(options);
        stakeGems = uint32(raw);
        gapPercent = uint16(raw >> 32);
        if (raw >> 48 != 0 || stakeGems == 0) {
            revert InvalidTableOptions(options);
        }
        stakeTokens = uint256(stakeGems) * NUM_TOKENS_PER_GEMS;
    }

    /// @notice The board's side, from the members seated at the start; zero before it.
    function _boardSide() internal view returns (uint256 side) {
        uint256 startedWith = _roster().startedWith;
        if (startedWith == 0) {
            return 0;
        }
        (, uint32 stakeGems, uint16 gapPercent) = _tableOptions();
        // ceil(n / 100) cells, then the smallest side whose square holds them
        uint256 cells = (startedWith * uint256(stakeGems) * (100 + uint256(gapPercent)) + 99) / 100;
        side = _sqrt(cells);
        if (side * side < cells) {
            side += 1;
        }
    }

    /// @notice The square's bounds, inclusive, centred on the origin.
    function _boardBounds() internal view returns (int32 min, int32 max, uint256 side) {
        side = _boardSide();
        int256 low = -int256(side / 2);
        min = int32(low);
        max = int32(low + int256(side) - 1);
    }

    /// @dev floor(sqrt(x)), Babylonian.
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) {
            return 0;
        }
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    //-------------------------------------------------------------------------
    // THE BOARD'S CYCLE
    //-------------------------------------------------------------------------

    /// @notice The board's cycle: the clock's until the end, then the final board's.
    function _currentCycle() internal view virtual override returns (uint24 cycle, bool commiting) {
        (uint64 cycleNumber, bool isCommiting) = _cycleNumber();
        uint64 last = _lastCycleNumber();
        if (last != 0 && cycleNumber > last) {
            cycleNumber = last + MAX_LIFE;
        }
        if (cycleNumber > type(uint24).max) {
            revert CycleTooFar(cycleNumber);
        }
        return (uint24(cycleNumber), isCommiting);
    }
}

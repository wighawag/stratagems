// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {UsingCommitRevealTypes} from "./UsingCommitRevealTypes.sol";

/// @title The events of the commit-reveal base
/// @dev Emitted by {CommitReveal} and {UsingCommitReveal} through qualified
///      names, and inherited by a game's own events interface so that they are
///      in the game's ABI where a client looks for them.
///
///      `player` IS A `uint256` IN EVERY EVENT HERE, and it is the same
///      `uint256` the store keys by: whatever the game means by a player
///      (an account widened, an avatar's token id), never an address that a
///      token game would have to truncate into.
///
///      NO EVENT HERE CARRIES A GAME'S ACTIONS. The base never sees them: a
///      game emits what its actions did in events of its own, and a reader
///      wanting whole turns stitches the chunk events below on
///      `furtherActions`.
interface UsingCommitRevealEvents is UsingCommitRevealTypes {
    /// @notice A player topped up the reserve they are willing to risk.
    event ReserveDeposited(
        uint256 indexed player,
        uint256 amountAdded,
        uint256 newAmount
    );

    /// @notice A player took tokens back out of their reserve.
    event ReserveWithdrawn(
        uint256 indexed player,
        uint256 amountRemoved,
        uint256 newAmount
    );

    /// @notice A player committed to a turn for this cycle.
    event CommitmentMade(
        uint256 indexed player,
        uint64 indexed cycleNumber,
        bytes24 commitmentHash,
        uint256 bond
    );

    /// @notice A player withdrew their commitment before the reveal phase.
    event CommitmentCancelled(
        uint256 indexed player,
        uint64 indexed cycleNumber
    );

    /// @notice A player revealed a chunk of what they had committed to.
    /// @param commitmentHash The head this reveal opened, which for the second
    ///        and later chunks of a turn is not the hash that was committed.
    /// @param furtherActions The new head, or zero when this completed the turn.
    /// @param cost What the game's resolution reported this chunk cost, taken
    ///        from the bond and from the reserve.
    event CommitmentRevealed(
        uint256 indexed player,
        uint64 indexed cycleNumber,
        bytes24 commitmentHash,
        bytes24 furtherActions,
        uint256 cost
    );

    /// @notice A missed reveal was settled, in whole or by one chunk.
    /// @dev ONE EVENT FOR BOTH ROUTES, shaped like {CommitmentRevealed} because
    ///      a settlement shown the chunks walks the chain exactly as a reveal
    ///      does. A settlement WITHOUT them closes the commitment in one call
    ///      and reports a zero `furtherActions`.
    /// @param cycleNumber The cycle in progress when it was settled.
    /// @param commitmentHash The head this settlement opened or closed.
    /// @param furtherActions The new head, or zero when the commitment is now
    ///        closed and any surplus of its bond is reserve again.
    /// @param forfeited How much the game's {UsingCommitReveal-_forfeit} took,
    ///        in the units of the bond. A game whose stake is not a bond (an
    ///        avatar in custody) reports zero here and says what it took in an
    ///        event of its own.
    event CommitmentVoid(
        uint256 indexed player,
        uint64 indexed cycleNumber,
        bytes24 commitmentHash,
        bytes24 furtherActions,
        uint256 forfeited
    );

    /// @notice The cycle moved because somebody pushed it, rather than because
    ///         the clock said so.
    /// @dev A clock-driven turnover emits nothing, because nothing happened on
    ///      chain: that is the difference this event exists to make visible.
    event CycleAdvanced(
        uint64 indexed cycleNumber,
        bool commiting,
        address pushedBy
    );

    /// @notice The cycle started, or stopped, waiting for this player.
    /// @param waitedFor Whether it now waits for them.
    /// @param waitedForCount How many members it waits for in total, which is
    ///        the denominator unanimity is measured against.
    event WaitedForChanged(
        uint256 indexed player,
        bool waitedFor,
        uint64 waitedForCount
    );
}

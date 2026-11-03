// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {UsingCommitRevealTypes} from "./UsingCommitRevealTypes.sol";

/// @title What a game for a fixed set of members exposes
/// @notice The routes a game adds to be cloned per table by
///         {CommitRevealGameFactory}: the initialiser the factory calls, the
///         creator's two powers, and the roster as a client reads it. The rules
///         are the base's ({UsingCommitReveal-_openRoster}); a game's route only
///         forwards to them.
interface ICommitRevealLobby is UsingCommitRevealTypes {
    /// @notice Give this game a closed roster of `seats`, created by `creator`,
    ///         playing `cycles` cycles from its start, with the game's own
    ///         `gameOptions` (opaque to the base; zero for none).
    /// @dev Once. The factory calls it in the transaction that makes the
    ///      clone, so nobody can open a clone's roster before it does.
    function initializeLobby(
        address creator,
        uint8 seats,
        uint16 cycles,
        bytes32 gameOptions
    ) external;

    /// @notice Start the game: the creator (or a delegate of theirs), once two
    ///         or more are seated. Closes the roster and re-anchors the clock.
    function start() external returns (uint64 cycleNumber);

    /// @notice Forfeit a member who has not committed in the current commit
    ///         phase: the creator (or a delegate of theirs) only.
    function forfeitMember(uint256 player) external;

    /// @notice The roster, and who holds a seat.
    function getRoster()
        external
        view
        returns (Roster memory roster, uint256[] memory members);

    /// @notice Where the game is against its end: the current cycle, the last
    ///         it plays (zero before the start), and whether it is past it.
    function getEnd()
        external
        view
        returns (uint64 cycleNumber, uint64 lastCycleNumber, bool ended);

    /// @notice Whether the game has played its last cycle.
    function hasEnded() external view returns (bool);

    /// @notice What the game's own rules read at this table, as created.
    function getGameOptions() external view returns (bytes32);
}

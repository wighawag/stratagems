// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "./UsingStratagemsTypes.sol";
import {UsingCommitRevealEvents} from "../../commit-reveal/interfaces/UsingCommitRevealEvents.sol";

/// @dev The base's events (reserve, commitment, reveal, void, cycle) plus the
///      game's. The base's `CommitmentRevealed` carries no actions, because the
///      base never sees them: the moves of a revealed chunk are in
///      {MovesRevealed}, emitted between the chunk's open and its close.
interface UsingStratagemsEvents is UsingStratagemsTypes, UsingCommitRevealEvents {
    /// @notice The moves of one revealed chunk, as committed (skipped ones included).
    event MovesRevealed(uint256 indexed player, uint64 indexed cycleNumber, Move[] moves);

    event SinglePoke(uint64 indexed cycleNumber, uint64 position);

    event MultiPoke(uint64 indexed cycleNumber, uint64[] positions);

    event MoveProcessed(uint64 indexed position, address indexed player, Color oldColor, Color newColor);
}

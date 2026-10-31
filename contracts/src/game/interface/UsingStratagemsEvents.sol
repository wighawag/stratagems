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

    /// @notice The cells a resolution (a chunk, a poke) wrote, as stored: what an indexer folds
    ///         instead of running the rules again.
    /// @param owners one word per move (or poke), `owner << 64 | position`: the
    ///        owner of the moved cell after the resolution (a resolution changes
    ///        no other owner)
    /// @param cells one word per cell written, `position << 128 | record`, where
    ///        `record` is the {Cell}'s storage slot as it is, its first field in
    ///        the lowest bits: `lastCycleUpdate` (bits 0 to 23),
    ///        `cycleWhenTokenIsAdded` (24 to 47), `producingCycles` (48 to 71),
    ///        `color` (72 to 79), `life` (80 to 87), `delta` (88 to 95, two's
    ///        complement), `enemyMap` (96 to 103), `distribution` (104 to 111),
    ///        `stake` (112 to 119). Each moved cell, then its neighbours that hold
    ///        a colour, move by move, all read after the whole resolution: a cell
    ///        listed twice is listed with the same word.
    event CellsWritten(uint64 indexed cycleNumber, uint256[] owners, uint256[] cells);
}

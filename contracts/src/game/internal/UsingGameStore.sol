// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/UsingGameTypes.sol";
import {UsingCommitReveal} from "../../commit-reveal/UsingCommitReveal.sol";

/// @dev THIS GAME'S STATE, AND ONLY THIS GAME'S. The reserve, the commitments,
///      the cycle and who it waits for are the commit-reveal base's
///      (`src/commit-reveal/`), held in its own namespaced storage and reached
///      through {UsingCommitReveal}; what is declared here is the board and
///      the two numbers its actions need.
abstract contract UsingGameStore is UsingGameTypes, UsingCommitReveal {
    /// @notice the token players stake in order to place
    IERC20 internal immutable TOKENS;
    /// @notice how much one placement costs
    uint256 internal immutable PLACEMENT_COST;

    /// @notice The board. Accumulated, never contested: see _reveal.
    /// @dev Keyed by WHO PLAYS, as a number and never as an address, which is
    ///      the storage half of the rule the client keeps in
    ///      `web/src/lib/game/identity.ts`: twenty bytes holds every account
    ///      and does not hold every token id.
    mapping(uint64 => Cell) internal _cells;
    mapping(uint64 => mapping(uint256 => uint256)) internal _stakeOnCellBy;

    /// @notice Which cells of a zone have ever been placed on.
    /// @dev The index that makes reading a viewport cost what the board HOLDS
    ///      instead of a flat 16x16 per zone. Append-only, and safe to be so:
    ///      a cell is claimed by accumulation and nothing ever un-claims it, so
    ///      an entry can never go stale and the list needs no removal. Written
    ///      by _place on a cell's first ever placement; read by _cellsInZones.
    mapping(uint64 => uint64[]) internal _occupiedCellsInZone;

    /// @notice Create an instance of a game
    /// @param config configuration options for the game
    constructor(
        Config memory config
    )
        UsingCommitReveal(
            CommitRevealConfig({
                startTime: config.startTime,
                commitPhaseDuration: config.commitPhaseDuration,
                revealPhaseDuration: config.revealPhaseDuration,
                time: config.time,
                actionsPerReveal: config.actionsPerReveal,
                cyclePolicy: config.cyclePolicy
            })
        )
    {
        TOKENS = config.tokens;
        PLACEMENT_COST = config.placementCost;
    }
}

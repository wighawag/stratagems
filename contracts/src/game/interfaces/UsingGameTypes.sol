// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "solidity-kit/solc_0_8/debug/time/interfaces/ITime.sol";
import "solidity-kit/solc_0_8/ERC20/interfaces/IERC20.sol";
import {UsingCommitRevealTypes} from "../../commit-reveal/interfaces/UsingCommitRevealTypes.sol";

/// @dev THE MECHANISM'S TYPES ARE INHERITED, not declared here: `Cycle`,
///      `Commitment`, `Attendance` and `CyclePolicy` are the commit-reveal
///      base's (`src/commit-reveal/`). What is left is this game: its config,
///      which is the base's plus a token and a placement cost, and its cells.
interface UsingGameTypes is UsingCommitRevealTypes {
    // ------------------------------------------------------------------------
    // EXTERNAL TYPES
    // ------------------------------------------------------------------------

    /// @notice Config struct to configure the game instance
    struct Config {
        uint256 startTime;
        uint256 commitPhaseDuration;
        uint256 revealPhaseDuration;
        ITime time;
        /// @notice the token players stake to place
        IERC20 tokens;
        /// @notice how much one placement costs, taken from the player's reserve
        uint256 placementCost;
        /// @notice THE CHUNK: how many actions one reveal transaction may carry.
        /// @dev A DEPLOYMENT PARAMETER AND NOT A CONSTANT, because the two things
        ///      that decide it are both outside the framework: how expensive one
        ///      action is to resolve (the game's) and what fits in a transaction
        ///      (the chain's). A number baked into the contract would be one
        ///      game's answer on one chain, presented as a universal.
        ///
        ///      It is here beside {cyclePolicy} for a second reason: this is how
        ///      the CLIENT learns it. A client has to split a turn into exactly
        ///      the pieces this contract will accept, and a copy of the number in
        ///      the front end is a copy that can drift into reverting every
        ///      reveal. See `web/src/lib/placement/config.ts`.
        ///
        ///      Zero is refused at construction: it would make every turn
        ///      unrevealable, which costs the first player their stake rather
        ///      than reverting anything. See {UsingCommitReveal}.
        uint256 actionsPerReveal;
        /// @notice how the cycle advances
        CyclePolicy cyclePolicy;
    }

    /// @notice One placement, as revealed by the player.
    /// @dev The board accumulates these. It never compares one player's
    ///      placement against another's, because that would make the outcome
    ///      depend on the order reveals arrive in. See _reveal.
    struct Placement {
        uint64 cellID;
    }

    /// @notice A cell's public state.
    struct Cell {
        /// @notice total stake placed here by everyone
        uint256 totalStake;
        /// @notice how many distinct players have placed here
        uint32 numClaimants;
    }

    /// @notice One cell as ONE PLAYER'S placement sees it: what the cell holds
    ///         and what that player holds on it.
    /// @dev THE INPUT AND THE OUTPUT OF THE PURE CORE, {UsingGameInternal-_placementOutcome}.
    ///      A reveal loads one from storage, resolves it, and writes back what
    ///      the core returns; the simulation route {IGameSimulation} is handed
    ///      them by a client and returns what the same core makes of them. Both
    ///      run the same function, which is the point: a client previewing a
    ///      turn runs the rule the chain runs, not a copy of it.
    struct PlayerCell {
        uint64 cellID;
        /// @notice total stake placed here by everyone
        uint256 totalStake;
        /// @notice how many distinct players have placed here
        uint32 numClaimants;
        /// @notice what this player has placed here, in every cycle so far
        uint256 playerStake;
    }

    /// @notice A cell plus its id, for range queries.
    struct CellAt {
        uint64 cellID;
        uint256 totalStake;
        uint32 numClaimants;
    }

    // ------------------------------------------------------------------------
}

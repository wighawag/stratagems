// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./UsingGameTypes.sol";
import {UsingCommitRevealEvents} from "../../commit-reveal/interfaces/UsingCommitRevealEvents.sol";

/// @dev THE MECHANISM'S EVENTS ARE INHERITED from the commit-reveal base
///      (`src/commit-reveal/`): reserve, commitment, reveal, settlement, cycle
///      and attendance. Its reveal event carries no actions, because the base
///      never sees them; what a reveal did to the board is {Placed}, one per
///      placement, which is this game's.
///
///      `player` IS A `uint256` IN EVERY EVENT HERE, and it is the same
///      `uint256` the store keys by: whatever this game means by a player,
///      never an address that a token game would have to truncate into.
interface UsingGameEvents is UsingGameTypes, UsingCommitRevealEvents {
    /// @notice A player took a share of a cell. Cells are shared, so this does
    ///         not imply anyone lost it.
    event Placed(uint256 indexed player, uint64 indexed cellID, uint256 stake);
}

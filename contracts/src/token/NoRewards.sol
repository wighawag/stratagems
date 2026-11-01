// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./interface/IOnStakeChange.sol";

/// @title No rewards: the generator a TABLE is built with
/// @notice A table (one game for a fixed set of players, created by anyone)
///         earns nothing outside itself. Its config names this contract as its
///         generator, so every stake change its resolution reports goes
///         nowhere.
/// @dev BY DESIGN, NOT FOR NOW (step L2, PL2-2 of
///      work/plans/join-template-commit-reveal.md): {RewardsGenerator} is the
///      persistent world's, and rewards at tables anyone can create would be
///      easy to farm (a table of one's own accounts). A config rather than a
///      variant of the routes, because the generator is a config immutable and
///      the ERC721 route calls it directly, which a variant of the setters
///      would not reach.
contract NoRewards is IOnStakeChange {
    function add(address, uint256) external {}

    function remove(address, uint256) external {}

    function move(address, address, uint256) external {}
}

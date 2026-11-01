// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../internal/UsingGameInternal.sol";
import {ICommitRevealLobby} from "../../commit-reveal/interfaces/ICommitRevealLobby.sol";

/// @title The Game's lobby route: a table for a fixed set of players
/// @dev No `@notice` here: the router merges every route's docs into one, and
///      {GameDelegation} already gives the contract its notice.
///
///      Deployed ONLY behind the lobby implementation, which
///      {CommitRevealGameFactory} clones per game, and never behind the
///      persistent world's router: there, without this route, nothing can
///      open a roster, so its entry stays open. Everything here forwards to
///      the base, where the roster's rules are.
contract GameLobby is ICommitRevealLobby, UsingGameInternal {
    constructor(Config memory config) UsingGameInternal(config) {}

    /// @inheritdoc ICommitRevealLobby
    function initializeLobby(address creator, uint8 seats) external {
        _openRoster(creator, seats);
    }

    /// @inheritdoc ICommitRevealLobby
    function start() external returns (uint64 cycleNumber) {
        return _startGame(msg.sender);
    }

    /// @inheritdoc ICommitRevealLobby
    function forfeitMember(uint256 player) external {
        _forfeitMember(msg.sender, player);
    }

    /// @inheritdoc ICommitRevealLobby
    function getRoster()
        external
        view
        returns (Roster memory roster, uint256[] memory members)
    {
        return (_roster(), _members());
    }
}

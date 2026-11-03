// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import {UsingCommitReveal} from "./UsingCommitReveal.sol";
import {ICommitRevealLobby} from "./interfaces/ICommitRevealLobby.sol";

/// @title The lobby route: a table for a fixed set of players
/// @dev No `@notice` here: the router merges every route's docs into one, and
///      a game's own routes give the contract its notice.
///
///      THE SAME ROUTE FOR EVERY GAME, which is why it lives with the base
///      rather than with a game: the roster's rules are all the base's, and
///      the base's storage is namespaced, so a route that inherits nothing but
///      {UsingCommitReveal} shares a router with any game's routes. A game adds
///      it to its LOBBY IMPLEMENTATION's routes, built with the same cycle
///      config as the rest of them (a game that overrides {_cycle} cannot use
///      it as it stands, since this route would read the base's).
///
///      Deployed ONLY behind a lobby implementation, which
///      {CommitRevealGameFactory} clones per table, and never behind a
///      persistent world's router: there, without this route, nothing can open
///      a roster, so its entry stays open.
contract CommitRevealLobby is ICommitRevealLobby, UsingCommitReveal {
    constructor(CommitRevealConfig memory config) UsingCommitReveal(config) {}

    /// @inheritdoc ICommitRevealLobby
    function initializeLobby(
        address creator,
        uint8 seats,
        uint16 cycles,
        bytes32 gameOptions
    ) external {
        _openRoster(creator, seats, cycles, gameOptions);
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

    /// @inheritdoc ICommitRevealLobby
    function getEnd()
        external
        view
        returns (uint64 cycleNumber, uint64 lastCycleNumber, bool ended)
    {
        (cycleNumber, ) = _cycleNumber();
        lastCycleNumber = _lastCycleNumber();
        ended = lastCycleNumber != 0 && cycleNumber > lastCycleNumber;
    }

    /// @inheritdoc ICommitRevealLobby
    function hasEnded() external view returns (bool) {
        return _hasEnded();
    }

    /// @inheritdoc ICommitRevealLobby
    function getGameOptions() external view returns (bytes32) {
        return _gameOptions();
    }
}

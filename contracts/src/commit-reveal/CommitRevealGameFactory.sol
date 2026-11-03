// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ICommitRevealLobby} from "./interfaces/ICommitRevealLobby.sol";

/// @title Games for a fixed set of players, created by anyone
/// @notice Each game is an ADDRESS of its own: an EIP-1167 clone of one lobby
///         implementation (a game's router, deployed once with the lobby's
///         config), given its roster in the same transaction.
/// @dev WHY A CLONE, AND NOT A GAME ID INSIDE ONE CONTRACT. Everything a
///      client keys by is the game contract's address already (the stored
///      submission, the delegation, the indexer, a reveal service's slot), so
///      a game at an address of its own needs nothing new of any of them. A
///      game id would rewrite every one, the stored secret of a commitment
///      among them, which is a wire. A full deployment per game would work too,
///      and costs every route's code again.
///
///      THE CONFIG IS THE IMPLEMENTATION'S. A game's rules (its durations, its
///      policy, its chunk) are immutables baked into its routes, so every
///      clone of one implementation plays by the same ones; a different config
///      is a different implementation, and a factory of its own.
contract CommitRevealGameFactory {
    /// @notice A game was created, with `seats` seats, by `creator`, to play
    ///         `cycles` cycles with the game's own `gameOptions`.
    event GameCreated(
        address indexed game,
        address indexed creator,
        uint8 seats,
        uint16 cycles,
        bytes32 gameOptions
    );

    /// @notice the lobby implementation every game here is a clone of
    address public immutable IMPLEMENTATION;

    address[] internal _games;

    constructor(address implementation) {
        IMPLEMENTATION = implementation;
    }

    /// @notice Create a game of `seats` seats playing `cycles` cycles, with
    ///         the caller as its creator.
    /// @param gameOptions What the game's own rules read at this table (zero
    ///        for none); the game refuses what it cannot read, when it reads
    ///        it, and the factory checks nothing of it.
    /// @dev The creator is the CALLER, never a parameter: naming somebody else
    ///      would hand them a game they did not ask for.
    function createGame(
        uint8 seats,
        uint16 cycles,
        bytes32 gameOptions
    ) external returns (address game) {
        game = Clones.clone(IMPLEMENTATION);
        ICommitRevealLobby(game).initializeLobby(
            msg.sender,
            seats,
            cycles,
            gameOptions
        );
        _games.push(game);
        emit GameCreated(game, msg.sender, seats, cycles, gameOptions);
    }

    /// @notice How many games this factory has created.
    function numGames() external view returns (uint256) {
        return _games.length;
    }

    /// @notice The games created, from `start`, at most `limit` of them.
    /// @dev A list rather than only the event, so a client discovers games
    ///      with one call on any node, without a log range.
    function getGames(
        uint256 start,
        uint256 limit
    ) external view returns (address[] memory games) {
        uint256 total = _games.length;
        if (start >= total) {
            return games;
        }
        uint256 end = start + limit > total ? total : start + limit;
        games = new address[](end - start);
        for (uint256 i = start; i < end; i++) {
            games[i - start] = _games[i];
        }
    }
}

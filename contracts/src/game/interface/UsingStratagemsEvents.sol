// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./UsingStratagemsTypes.sol";

interface UsingStratagemsEvents is UsingStratagemsTypes {
    /// @notice A player has commited to make a move and reveal it on the reveal phase
    /// @param player account taking the staking risk (can be a different account than the one controlling the gems)
    /// @param epoch epoch number on which this commit belongs to
    /// @param commitmentHash the hash of moves
    event CommitmentMade(address indexed player, uint24 indexed epoch, bytes24 commitmentHash);

    /// @notice A player has cancelled its current commitment (before it reached the reveal phase)
    /// @param player account taking the staking risk (can be a different account than the one controlling the gems)
    /// @param epoch epoch number on which this commit belongs to
    event CommitmentCancelled(address indexed player, uint24 indexed epoch);

    /// @notice A player has canceled a previous commitment by burning some tokens
    /// @param player the account that made the commitment
    /// @param epoch epoch number on which this commit belongs to
    /// @param amountBurnt amount of token to burn
    /// @param furtherMoves hash of further moves, unless bytes32(0) which indicate end.
    event CommitmentVoid(address indexed player, uint24 indexed epoch, uint256 amountBurnt, bytes24 furtherMoves);

    /// @notice Player has revealed its previous commitment
    /// @param player account who commited
    /// @param epoch epoch number on which this commit belongs to
    /// @param commitmentHash the hash of the moves
    /// @param moves the moves
    /// @param furtherMoves hash of further moves, unless bytes32(0) which indicate end.
    event CommitmentRevealed(
        address indexed player,
        uint24 indexed epoch,
        bytes24 indexed commitmentHash,
        Move[] moves,
        bytes24 furtherMoves,
        uint256 newReserveAmount
    );

    /// @notice poke cell and update it if needed
    /// @param position cell to poke
    /// @param epoch epoch number at which the poke take place
    event SinglePoke(uint24 indexed epoch, uint64 position);

    /// @notice poke multiple cells and update them if needed
    /// @param positions cells to poke
    /// @param epoch epoch number at which the poke take place
    event MultiPoke(uint24 indexed epoch, uint64[] positions);

    /// @notice Player have withdrawn token from the reserve
    /// @param player account withdrawing the tokens
    /// @param amountWithdrawn the number of tokens withdrawnn
    /// @param newAmount the number of tokens in reserver as a result
    event ReserveWithdrawn(address indexed player, uint256 amountWithdrawn, uint256 newAmount);

    /// @notice Player has deposited token in the reserve, allowing it to use that much in game
    /// @param player account receiving the token in the reserve
    /// @param amountDeposited the number of tokens deposited
    /// @param newAmount the number of tokens in reserver as a result
    event ReserveDeposited(address indexed player, uint256 amountDeposited, uint256 newAmount);

    // --------------------------------------------------------------------------------------------
    // Event to make it easier to check what is happening
    // TODO get rid ?
    // --------------------------------------------------------------------------------------------
    /// @notice A move has been revealed.
    /// @param position cell at which the move take place
    /// @param player account making the move
    /// @param oldColor previous color of the cell
    /// @param newColor color that takes over
    event MoveProcessed(uint64 indexed position, address indexed player, Color oldColor, Color newColor);
}

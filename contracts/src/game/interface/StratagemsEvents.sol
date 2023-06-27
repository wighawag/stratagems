// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './StratagemsTypes.sol';

interface StratagemsEvents is StratagemsTypes {
	/// @notice A player has commited to make a move and resolve it on the resolution phase
	/// @param player account taking the staking risk (can be a different account than the one controlling the gems)
	/// @param epoch epoch number on which this commit belongs to
	/// @param commitmentHash the hash of moves
	event CommitmentMade(address indexed player, uint32 indexed epoch, bytes24 commitmentHash);

	/// @notice A player has canceled a previous commitment by burning some tokens
	/// @param player the account that made the commitment
	/// @param epoch epoch number on which this commit belongs to
	/// @param amountBurnt amount of token to burn
	/// @param furtherMoves hash of further moves, unless bytes32(0) which indicate end.
	event CommitmentVoid(address indexed player, uint32 indexed epoch, uint256 amountBurnt, bytes24 furtherMoves);

	/// @notice Player has resolved its previous commitment
	/// @param player account who commited
	/// @param epoch epoch number on which this commit belongs to
	/// @param commitmentHash the hash of the moves
	/// @param moves the moves
	/// @param furtherMoves hash of further moves, unless bytes32(0) which indicate end.
	event CommitmentResolved(
		address indexed player,
		uint32 indexed epoch,
		bytes24 indexed commitmentHash,
		Move[] moves,
		bytes24 furtherMoves
	);

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
}

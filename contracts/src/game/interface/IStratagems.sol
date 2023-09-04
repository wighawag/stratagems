// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721.sol';
import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721Metadata.sol';
import 'solidity-kit/solc_0.8/ERC165/interfaces/IERC165.sol';
import './UsingStratagemsTypes.sol';
import './UsingStratagemsEvents.sol';

interface IStratagemsGameplay is UsingStratagemsTypes, UsingStratagemsEvents {
	/// @notice return updated cell (based on current epoch)
	/// @param id the cell id
	function getCell(uint256 id) external view returns (FullCell memory cell);

	/// @notice return the list of updated cells (based on current epoch) whose ids is given
	/// @param ids the list of cell ids
	function getCells(uint256[] memory ids) external view returns (FullCell[] memory cells);

	/// @notice the number of token in reserve per account
	///  This is used to slash player who do not resolve their commit
	///  The amount can be greater than the number of token required for the next move
	///  This allow player to potentially hide their intention.
	/// @param account the address to retrived the amount in reserve of.
	function getTokensInReserve(address account) external view returns (uint256 amount);

	/// @notice The commitment to be resolved. zeroed if no commitment need to be made.
	/// @param account the address of which to retrieve the commitment
	function getCommitment(address account) external view returns (Commitment memory commitment);

	/// @notice return the config used to initialise the Game
	function getConfig() external view returns (Config memory config);

	/// @notice called by players to add tokens to their reserve
	/// @param tokensAmountToAdd amount of tokens to add
	/// @param permit permit EIP2612, .value = zero if not needed
	function addToReserve(uint256 tokensAmountToAdd, Permit calldata permit) external;

	/// @notice called by players to commit their moves
	///  this can be called multiple time in the same epoch, the last call overriding the previous.
	///  When a commitment is made, it needs to be resolved in the resolution phase of the same epoch.abi
	///  If missed, player can still reveal its moves but none of them will be resolved.
	///   The player would lose its associated reserved amount.
	/// @param commitmentHash the hash of the moves
	function makeCommitment(bytes24 commitmentHash) external;

	/// @notice called by players to cancel their current commitment
	///  Can only be called during the commit phase in which the commitment was made
	///  It cannot be called afterward
	function cancelCommitment() external;

	/// @notice called to make a commitment along with tokens to add to the reserve
	/// @param commitmentHash the has of the moves
	/// @param tokensAmountToAdd amount of tokens to add to the reserve. the resulting total must be enough to cover the moves
	/// @param permit permit EIP2612, value = zero if not needed
	function makeCommitmentWithExtraReserve(
		bytes24 commitmentHash,
		uint256 tokensAmountToAdd,
		Permit calldata permit
	) external;

	/// @notice called by players to withdraw tokens from the reserve
	///  can only be called if no commitments are pending
	///  Note that while you can withdraw after commiting, note that if you do not have enough tokens
	///  you'll have your commitment failing.
	/// @param amount number of tokens to withdraw
	function withdrawFromReserve(uint256 amount) external;

	/// @notice called by player to resolve their commitment
	///  this is where the core logic of the game takes place
	///  This is where the game board evolves
	///  The game is designed so that resolution order do not matter
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
	///  Note that you have to that have enough moves (specified by MAX_NUM_MOVES_PER_HASH = 32)
	/// @param useReserve whether the tokens are taken from the reserve or from approvals.
	///  This allow player to keep their reserve intact and use it on their next move.
	///  Note that this require the Stratagems contract to have enough allowance.
	function resolve(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves,
		bool useReserve
	) external;

	/// @notice called by player if they missed the resolution phase and want to minimze the token loss.
	///  By providing the moves, they will be slashed only the amount of token required to make the moves
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
	function acknowledgeMissedResolution(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves
	) external;

	/// @notice should only be called as last resort
	/// this will burn all tokens in reserve
	/// If player has access to the secret, better call `acknowledgeMissedResolution`
	function acknowledgeMissedResolutionByBurningAllReserve() external;

	/// @notice poke a position, resolving its virtual state.
	//  If dead as a result, it will reward neighboor enemies colors
	/// @param position the cell position
	function poke(uint64 position) external;

	/// @notice poke and collect the tokens won across multiple cells
	/// @param positions cell positions to collect from
	function pokeMultiple(uint64[] calldata positions) external;
}

interface IStratagems is IStratagemsGameplay, IERC721, IERC721Metadata {}

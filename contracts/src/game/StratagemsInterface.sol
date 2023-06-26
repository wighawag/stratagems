// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/ERC20/ERC2612/interfaces/IERC20WithIERC2612.sol';
import './IStratagems.sol';

contract StratagemsInterface is IStratagems {
	IERC721 immutable _erc721;
	IStratagemsCore immutable _core;

	constructor(IStratagemsCore core, IERC721 erc721) {
		_core = core;
		_erc721 = erc721;
	}

	// --------------------------------------------------------------------------------------------
	// CORE
	// --------------------------------------------------------------------------------------------

	/// @notice called by players to add tokens to their reserve
	/// @param tokensAmountToAdd amount of tokens to add
	/// @param permit permit EIP2612, .value = zero if not needed
	function addToReserve(uint256 tokensAmountToAdd, Permit calldata permit) external {
		// return _core.addToReserve(tokensAmountToAdd);
	}

	/// @notice called by players to commit their moves
	///  this can be called multiple time, the last call overriding the previous.
	/// @param commitmentHash the hash of the moves
	function makeCommitment(bytes24 commitmentHash) external {}

	/// @notice called to make a commitment along with tokens to add to the reserve
	/// @param commitmentHash the has of the moves
	/// @param tokensAmountToAdd amount of tokens to add to the reserve. the resulting total must be enough to cover the moves
	/// @param permit permit EIP2612, value = zero if not needed
	function makeCommitmentWithExtraReserve(
		bytes24 commitmentHash,
		uint256 tokensAmountToAdd,
		Permit calldata permit
	) external {}

	/// @notice called by players to withdraw tokens from the reserve
	///  can only be called if no commitments are pending
	///  Note that while you can withdraw after commiting, note that if you do not have enough tokens
	///  you'll have your commitment failing.
	/// @param amount number of tokens to withdraw
	function withdrawFromReserve(uint256 amount) external {}

	/// @notice called by player to resolve their commitment
	///  this is where the core logic of the game takes place
	///  This is where the game board evolves
	///  The game is designed so that resolution order do not matter
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
	///  Note that you have to that number of mvoes
	function resolve(address player, bytes32 secret, Move[] calldata moves, bytes24 furtherMoves) external {}

	/// @notice called by player if they missed the resolution phase and want to minimze the token loss
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
	) external {}

	/// @notice should only be called as last resort
	/// this will burn all tokens in reserve
	/// If player has access to the secret, better call acknowledgeMissedResolution
	function acknowledgeMissedResolutionByBurningAllReserve() external {}

	/// @notice poke a position, resolving its virtual state and if dead, reward neighboor enemies colors
	/// @param position the cell position
	function poke(uint64 position) external {}

	/// poke and collect the tokens won
	/// @param positions cell positions to collect from
	function pokeMultiple(uint64[] calldata positions) external {}

	// --------------------------------------------------------------------------------------------
	// IERC721
	// --------------------------------------------------------------------------------------------

	// /// @inheritdoc IERC721
	/// @notice balanceOf is not implemented
	function balanceOf(address) external pure override returns (uint256) {
		revert('NOT_IMPLEMENTED');
	}

	/// @inheritdoc IERC721
	function ownerOf(uint256 tokenID) external view override returns (address owner) {}

	/// @inheritdoc IERC721
	function safeTransferFrom(address from, address to, uint256 tokenID, bytes calldata data) external override {}

	/// @inheritdoc IERC721
	function safeTransferFrom(address from, address to, uint256 tokenID) external override {}

	/// @inheritdoc IERC721
	function transferFrom(address from, address to, uint256 tokenID) external override {}

	/// @inheritdoc IERC721
	function approve(address operator, uint256 tokenID) external override {}

	/// @inheritdoc IERC721
	function setApprovalForAll(address operator, bool approved) external override {}

	/// @inheritdoc IERC721
	function getApproved(uint256 tokenID) external view override returns (address operator) {}

	/// @inheritdoc IERC721
	function isApprovedForAll(address owner, address operator) external view override returns (bool) {}

	// --------------------------------------------------------------------------------------------
	// IERC165
	// --------------------------------------------------------------------------------------------

	/// @inheritdoc IERC165
	function supportsInterface(bytes4 interfaceID) external view returns (bool) {}

	// --------------------------------------------------------------------------------------------
	// EXTRA (IERC721Metadata)
	// --------------------------------------------------------------------------------------------

	/// @notice A descriptive name for a collection of NFTs in this contract
	function name() external view returns (string memory) {}

	/// @notice An abbreviated name for NFTs in this contract
	function symbol() external view returns (string memory) {}

	/// @notice A distinct Uniform Resource Identifier (URI) for a given asset.
	/// @dev Throws if `_tokenId` is not a valid NFT. URIs are defined in RFC
	///  3986. The URI may point to a JSON file that conforms to the "ERC721
	///  Metadata JSON Schema".
	function tokenURI(uint256 _tokenId) external view returns (string memory) {}
}

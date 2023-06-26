// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './StratagemsCore.sol';
import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721.sol';

/// @title Stratagems, the infinite board game
/// @author Ronan Sandford (@wighawag)
/// @notice Stratagems is an infinite board game, a persistent and permission-less game
/// where players use a specific set of colors to compete for the control of the board.
/// Alliances and betrayal are part of the arsenal as colors mix and shift on the board.
contract Stratagems is StratagemsCore /*, IERC721 */ {
	constructor(Config memory config) StratagemsCore(config) {}

	/*
	// /// @inheritdoc IERC721
	/// @notice balanceOf is not implemented
	function balanceOf(address) external pure override returns (uint256) {
		revert('NOT_IMPLEMENTED');
	}

	/// @inheritdoc IERC721
	function ownerOf(uint256 tokenID) external view override returns (address owner) {
		uint64 id = uint64(tokenID);
		require(uint256(id) == tokenID, 'NOT_EXISTENT');
		owner = cells[tokenID].owner;
	}

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

	/// @inheritdoc IERC165
	function supportsInterface(bytes4 interfaceID) external view returns (bool) {}

	/// @notice A descriptive name for a collection of NFTs in this contract
	function name() external view returns (string memory) {}

	/// @notice An abbreviated name for NFTs in this contract
	function symbol() external view returns (string memory) {}

	/// @notice A distinct Uniform Resource Identifier (URI) for a given asset.
	/// @dev Throws if `_tokenId` is not a valid NFT. URIs are defined in RFC
	///  3986. The URI may point to a JSON file that conforms to the "ERC721
	///  Metadata JSON Schema".
	function tokenURI(uint256 _tokenId) external view returns (string memory) {}
    */
}

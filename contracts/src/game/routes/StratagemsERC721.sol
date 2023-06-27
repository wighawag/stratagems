// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../internal/StratagemsInternal.sol';
import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721.sol';
import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721Metadata.sol';

contract StratagemsERC721 is IERC721, IERC721Metadata, StratagemsInternal {
	constructor(Config memory config) StratagemsInternal(config) {}

	// /// @inheritdoc IERC721
	/// @notice balanceOf is not implemented
	function balanceOf(address) external pure override returns (uint256) {
		revert('NOT_IMPLEMENTED');
	}

	/// @inheritdoc IERC721
	function ownerOf(uint256 tokenID) external view override returns (address owner) {
		uint64 id = uint64(tokenID);
		require(uint256(id) == tokenID, 'NOT_EXISTENT');
		owner = _cells[tokenID].owner;
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

	/// @inheritdoc IERC721Metadata
	function name() external pure returns (string memory) {
		return 'GemCells';
	}

	/// @inheritdoc IERC721Metadata
	function symbol() external pure returns (string memory) {
		return 'GEM_CELL';
	}

	/// @inheritdoc IERC721Metadata
	function tokenURI(uint256 tokenID) external view returns (string memory) {}
}

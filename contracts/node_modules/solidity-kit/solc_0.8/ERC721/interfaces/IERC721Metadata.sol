// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IERC721.sol";

interface IERC721Metadata is IERC721 {
    /// @notice A descriptive name for a collection of NFTs in this contract
    function name() external view returns (string memory name);

    /// @notice An abbreviated name for NFTs in this contract
    function symbol() external view returns (string memory symbol);

    /// @notice A distinct Uniform Resource Identifier (URI) for a given asset.
    /// @dev Throws if `tokenID` is not a valid NFT. URIs are defined in RFC
    ///  3986. The URI may point to a JSON file that conforms to the "ERC721
    ///  Metadata JSON Schema".
    /// @param tokenID id of the token being queried.
    function tokenURI(uint256 tokenID) external view returns (string memory);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract ImplementingERC721Internal {
    function _ownerAndNonceOf(uint256 tokenID) internal view virtual returns (address owner, uint256 nonce);

    function _approveFor(
        address owner,
        uint256 nonce,
        address operator,
        uint256 tokenID
    ) internal virtual;

    function _setApprovalForAll(
        address sender,
        address operator,
        bool approved
    ) internal virtual;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../ERC165/interfaces/IERC165.sol";
import "../../utils/GenericErrors.sol";

interface IERC721Supply {
    /// @notice return the total number of token in existence
    function totalSupply() external view returns (uint256);
}

interface IERC721 is IERC165 {
    /// @notice Triggered when a token is transferred
    /// @param from the account the token is sent from
    /// @param to the account the token is sent to
    /// @param tokenID id of the token being sent
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenID);

    /// @notice Triggered when a token is approved to be sent by another account
    ///  Note tat the approval get reset when a Transfer event for that same token is emitted.
    /// @param owner current owner of the token
    /// @param approved account who can know transfer on the owner's behalf
    /// @param tokenID id of the token being approved
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenID);

    /// @notice Triggered when an account approve or disaprove another to transfer on its behalf
    /// @param owner the account granting rights over all of its token
    /// @param operator account who can know transfer on the owner's behalf
    /// @param approved whether it is approved or not
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /// @notice The token does not exist
    /// @param tokenID id of the expected token
    error NonExistentToken(uint256 tokenID);
    /// @notice The address from which the token is sent is not the current owner
    /// @param provided the address expected to be the current owner
    /// @param currentOwner the current owner
    error NotOwner(address provided, address currentOwner);
    /// @notice An invalid address is specified (for example: zero address)
    /// @param addr invalid address
    error InvalidAddress(address addr);
    /// @notice The Transfer was rejected by the destination
    error TransferRejected();
    /// @notice The Nonce overflowed, make a transfer to self to allow new nonces.
    error NonceOverflow();

    /// @notice Get the number of tokens owned by an address.
    /// @param owner The address to look for.
    /// @return balance The number of tokens owned by the address.
    function balanceOf(address owner) external view returns (uint256 balance);

    /// @notice Get the owner of a token.
    /// @param tokenID The id of the token.
    /// @return owner The address of the token owner.
    function ownerOf(uint256 tokenID) external view returns (address owner);

    /// @notice Transfer a token between 2 addresses letting the receiver knows of the transfer.
    /// @param from The sender of the token.
    /// @param to The recipient of the token.
    /// @param tokenID The id of the token.
    /// @param data Additional data.
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenID,
        bytes calldata data
    ) external;

    /// @notice Transfer a token between 2 addresses letting the receiver know of the transfer.
    /// @param from The send of the token.
    /// @param to The recipient of the token.
    /// @param tokenID The id of the token.
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenID
    ) external;

    /// @notice Transfer a token between 2 addresses.
    /// @param from The sender of the token.
    /// @param to The recipient of the token.
    /// @param tokenID The id of the token.
    function transferFrom(
        address from,
        address to,
        uint256 tokenID
    ) external;

    /// @notice Approve an operator to transfer a specific token on the senders behalf.
    /// @param operator The address receiving the approval.
    /// @param tokenID The id of the token.
    function approve(address operator, uint256 tokenID) external;

    /// @notice Set the approval for an operator to manage all the tokens of the sender.
    /// @param operator The address receiving the approval.
    /// @param approved The determination of the approval.
    function setApprovalForAll(address operator, bool approved) external;

    /// @notice Get the approved operator for a specific token.
    /// @param tokenID The id of the token.
    /// @return operator The address of the operator.
    function getApproved(uint256 tokenID) external view returns (address operator);

    /// @notice Check if the sender approved the operator to transfer any of its tokens.
    /// @param owner The address of the owner.
    /// @param operator The address of the operator.
    /// @return isOperator The status of the approval.
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

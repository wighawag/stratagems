// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../ERC165/interfaces/IERC165.sol";

interface IERC4494 is IERC165 {
    /// @notice The permit has expired
    /// @param currentTime time at which the error happen
    /// @param deadline the deadline
    error DeadlineOver(uint256 currentTime, uint256 deadline);
    /// @notice The signature do not match the expected signer
    error InvalidSignature();

    /// @notice EIP-712 Domain separator hash
    function DOMAIN_SEPARATOR() external view returns (bytes32);

    /// @notice Allows to retrieve current nonce for token
    /// @param tokenID token id
    /// @return nonce token nonce
    function nonces(uint256 tokenID) external view returns (uint256 nonce);

    /// @notice function to be called by anyone to approve `spender` using a Permit signature
    /// @dev Anyone can call this to approve `spender`, even a third-party
    /// @param spender the actor to approve
    /// @param tokenID the token id
    /// @param deadline the deadline for the permit to be used
    /// @param signature permit
    function permit(
        address spender,
        uint256 tokenID,
        uint256 deadline,
        bytes memory signature
    ) external;
}

interface IERC4494PermitForAll {
    /// @notice EIP-712 Domain separator hash
    function DOMAIN_SEPARATOR() external view returns (bytes32);

    /// @notice Allows to retrieve current nonce for the account
    /// @param account account to query
    /// @return nonce account's nonce
    function nonces(address account) external view returns (uint256 nonce);

    /// @notice function to be called by anyone to approve `spender` using a Permit signature
    /// @dev Anyone can call this to approve `spender`, even a third-party
    /// @param signer the one giving permission
    /// @param spender the actor to approve
    /// @param deadline the deadline for the permit to be used
    /// @param signature permit
    function permitForAll(
        address signer,
        address spender,
        uint256 deadline,
        bytes memory signature
    ) external;
}

interface IERC4494Alternative is IERC165 {
    /// @notice EIP-712 Domain separator hash
    function DOMAIN_SEPARATOR() external view returns (bytes32);

    /// @notice Allows to retrieve current nonce for token
    /// @param tokenID token id
    /// @return nonce token nonce
    function tokenNonces(uint256 tokenID) external view returns (uint256 nonce);

    /// @notice function to be called by anyone to approve `spender` using a Permit signature
    /// @dev Anyone can call this to approve `spender`, even a third-party
    /// @param spender the actor to approve
    /// @param tokenID the token id
    /// @param deadline the deadline for the permit to be used
    /// @param signature permit
    function permit(
        address spender,
        uint256 tokenID,
        uint256 deadline,
        bytes memory signature
    ) external;
}

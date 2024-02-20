// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC20Errors.sol";

interface IERC20 {
    /// @notice trigger when tokens are transferred, including zero value transfers.
    /// @param from the account the tokens are sent from
    /// @param to the account the tokens are sent to
    /// @param value number of tokens sent
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice trigger on approval amount being set.
    ///   Note that Transfer events need to be considered to compute the current allowance.
    /// @param owner the account approving the `spender`
    /// @param spender the account allowed to spend
    /// @param value the amount granted
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Returns the total token supply.
    function totalSupply() external view returns (uint256);

    /// @notice Returns the number of decimals the token uses.
    function decimals() external view returns (uint8);

    /// @notice Returns the symbol of the token.
    function symbol() external view returns (string memory);

    /// @notice Returns the name of the token.
    function name() external view returns (string memory);

    /// @notice Returns the account balance of another account with address `owner`.
    function balanceOf(address owner) external view returns (uint256);

    /// @notice Transfers `amount` of tokens to address `to`.
    function transfer(address to, uint256 amount) external returns (bool);

    /// @notice Returns the amount which `spender` is still allowed to withdraw from `owner`.
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Allows `spender` to withdraw from your account multiple times, up to `amount`.
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` tokens from address `from` to address `to`.
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}

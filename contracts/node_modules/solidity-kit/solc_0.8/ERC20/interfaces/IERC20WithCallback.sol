// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";

interface ITransferReceiver {
    /// @notice called by ERC20 token after transfer been executed.
    /// @param payer account sending the money
    /// @param amount number of token transfered
    /// @param data extra data
    function onTokenTransfer(
        address payer,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}

interface ITransferOnBehalfReceiver {
    /// @notice called by ERC20 token after transfer been executed.
    /// @param payer account sending the money
    /// @param forAddress account to be considered as te actual payer
    /// @param amount number of token transfered
    /// @param data extra data
    function onTokenTransferedOnBehalf(
        address payer,
        address forAddress,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}

interface IApprovalReceiver {
    /// @notice called by ERC20 token after transfer been executed.
    /// @param owner account that grant the approval
    /// @param amount number of token approved
    /// @param data extra data
    function onTokenApproval(
        address owner,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}

interface IERC20WithCallback is IERC20 {
    /// @notice transfer `amount` token to `to` and callback into it via `onTokenTransfer`
    /// @param to account to receive the tokens
    /// @param amount number of token to transfer
    /// @param data extra data
    /// @return success
    function transferAndCall(
        address to,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);

    /// @notice transfer `amount` token to `to` and callback into it via `onTokenTransfer`
    /// @param from account to send the token from
    /// @param to account to receive the tokens
    /// @param amount number of token to transfer
    /// @param data extra data
    /// @return success
    function transferFromAndCall(
        address from,
        address to,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);

    /// @notice transfer `amount` token to `to` and callback into it via `onTokenTransferedOnBehalf`
    /// @param forAddress account to send the token for
    /// @param to account to receive the tokens
    /// @param amount number of token to transfer
    /// @param data extra data
    /// @return success
    function transferOnBehalfAndCall(
        address forAddress,
        address to,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);

    /// @notice approve `amount` token to be spent by `spender` and callback into it via `onTokenApproval`
    /// @param spender account to send the token for
    /// @param amount number of token to transfer
    /// @param data extra data
    /// @return success
    function approveAndCall(
        address spender,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../ERC20/interfaces/IERC20.sol";

interface IWithdrawable {
    /// @notice withdraw the total balance of a particular ERC20 token owned by this contract.
    /// @param token ERC20 contract address to withdraw
    /// @param to address that will receive the tokens
    function withdrawERC20(IERC20 token, address to) external;
}

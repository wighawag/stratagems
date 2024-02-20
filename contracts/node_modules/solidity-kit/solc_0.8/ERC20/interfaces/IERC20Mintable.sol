// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";

interface IERC20Mintable is IERC20 {
    /// @notice bring into existence `amount` tokens and send them to `to`.
    function mint(address to, uint256 amount) external;
}

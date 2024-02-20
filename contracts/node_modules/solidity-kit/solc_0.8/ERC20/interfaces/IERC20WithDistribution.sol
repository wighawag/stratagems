// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";

interface IERC20WithDistribution is IERC20 {
    /// @notice transfer
    function transferAlongWithETH(address payable to, uint256 amount) external payable returns (bool);

    /// @notice distribute
    function distributeAlongWithETH(address payable[] memory tos, uint256 totalAmount) external payable returns (bool);
}

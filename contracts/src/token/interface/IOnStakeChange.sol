// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IOnStakeChange {
    function add(address account, uint256 amount) external;

    function remove(address account, uint256 amount) external;

    function move(address from, address to, uint256 amount) external;
}

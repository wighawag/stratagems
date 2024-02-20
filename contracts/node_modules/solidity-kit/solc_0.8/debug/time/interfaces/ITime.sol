// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITime {
    function timestamp() external view returns (uint256);
}

interface ITimeSetter {
    event TimeIncreased(uint256 newTime, uint256 delta);

    function increaseTime(uint256 delta) external;
}

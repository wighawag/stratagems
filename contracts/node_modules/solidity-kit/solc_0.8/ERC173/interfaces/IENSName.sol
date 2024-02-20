// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IENSName {
    /// @notice set the reverse-record name for this contract
    /// @param name ENS name to set
    function setENSName(string memory name) external;
}

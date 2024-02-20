// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract ImplementingExternalDomainSeparator {
    /// @notice EIP-712 Domain separator hash
    function DOMAIN_SEPARATOR() public view virtual returns (bytes32);
}

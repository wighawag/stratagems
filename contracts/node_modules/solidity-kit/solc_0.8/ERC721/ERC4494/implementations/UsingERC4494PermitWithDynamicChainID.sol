// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./UsingERC4494Permit.sol";
import "../../../ERC712/implementations/UsingERC712WithDynamicChainID.sol";

abstract contract UsingERC4494PermitWithDynamicChainID is UsingERC4494Permit, UsingERC712WithDynamicChainID {
    /// @inheritdoc ImplementingExternalDomainSeparator
    function DOMAIN_SEPARATOR() public view virtual override returns (bytes32) {
        return _currentDomainSeparator();
    }
}

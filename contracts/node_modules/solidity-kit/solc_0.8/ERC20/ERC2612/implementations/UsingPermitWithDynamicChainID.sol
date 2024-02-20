// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./UsingPermit.sol";
import "../../../ERC712/implementations/UsingERC712WithDynamicChainID.sol";

abstract contract UsingPermitWithDynamicChainID is UsingPermit, UsingERC712WithDynamicChainID {
    constructor(address verifyingContract) UsingERC712WithDynamicChainID(verifyingContract) {}

    /// @inheritdoc IERC2612
    function DOMAIN_SEPARATOR() public view virtual override returns (bytes32) {
        return _currentDomainSeparator();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Owned.sol";
import "../interfaces/IENSName.sol";

interface ReverseRegistrar {
    function setName(string memory name) external returns (bytes32);
}

interface ENS {
    function owner(bytes32 node) external view returns (address);
}

contract OwnedWithENS is Owned, IENSName {
    // namehash('addr.reverse')
    bytes32 internal constant ADDR_REVERSE_NODE = 0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;
    ENS internal immutable _ens;

    constructor(address initialOwner, address ens) Owned(initialOwner) {
        _ens = ENS(ens);
    }

    /// @inheritdoc IENSName
    function setENSName(string memory name) external {
        if (msg.sender != _getOwner()) {
            revert NotAuthorized();
        }
        ReverseRegistrar reverseRegistrar = ReverseRegistrar(_ens.owner(ADDR_REVERSE_NODE));
        reverseRegistrar.setName(name);
    }
}

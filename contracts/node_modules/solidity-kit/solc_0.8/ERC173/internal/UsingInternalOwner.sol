// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract UsingInternalOwner {
    function _getOwner() internal view virtual returns (address);
}

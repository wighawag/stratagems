// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/// A pure helper deployed from creation code only, the shape of a library a
/// game's routes call but that is deployed nowhere on its own.
contract ToyHelper {
    function double(uint256 x) external pure returns (uint256) {
        return x * 2;
    }
}

/// A contract as a deployment holds it: an immutable baked into its code by
/// the constructor, a pure function, a view that reads only the immutable, a
/// custom error, and a call into another contract of the sandbox.
contract Toy {
    error TooBig(uint256 value, uint256 limit);

    uint256 internal immutable FACTOR;
    ToyHelper internal immutable HELPER;

    constructor(uint256 factor, ToyHelper helper) {
        FACTOR = factor;
        HELPER = helper;
    }

    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }

    function scaled(uint256 x) external view returns (uint256) {
        return x * FACTOR;
    }

    function capped(uint256 x, uint256 limit) external pure returns (uint256) {
        if (x > limit) revert TooBig(x, limit);
        return x;
    }

    function doubledByHelper(uint256 x) external view returns (uint256) {
        return HELPER.double(x);
    }
}

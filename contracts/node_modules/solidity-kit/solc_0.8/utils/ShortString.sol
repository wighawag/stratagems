// from https://gist.github.com/frangio/61497715c43b79e3e2d7bfab907b01c2

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Unlike the string type, ShortString is a value type that can be made immutable.
// It supports strings of at most 32 bytes and assumes they don't contain null bytes.

type ShortString is bytes32;

error StringTooLong(string s);

function toShortString(string memory s) pure returns (ShortString) {
    bytes memory b = bytes(s);
    if (b.length > 32) {
        revert StringTooLong(s);
    }
    return ShortString.wrap(bytes32(b));
}

function shortStringLength(ShortString s) pure returns (uint256) {
    uint256 x = uint256(ShortString.unwrap(s));
    uint256 len = 0;
    for (uint256 m = 0xff << 248; m != 0; m >>= 8) {
        if (x & m == 0) {
            break;
        }
        len += 1;
    }
    return len;
}

function toString(ShortString s) pure returns (string memory) {
    bytes memory b = new bytes(32);
    uint256 len = shortStringLength(s);
    assembly {
        mstore(b, len)
        mstore(add(b, 32), s)
    }
    return string(b);
}

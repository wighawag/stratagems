// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

library PositionUtils {
    function toXY(uint64 position) internal pure returns (int32 x, int32 y) {
        x = int32(uint32(position) & 0xFFFFFFFF);
        y = int32(uint32(position >> 32));
    }

    function offset(uint64 position, int32 x, int32 y) internal pure returns (uint64 newPosition) {
        x = int32(uint32(position) & 0xFFFFFFFF) + x;
        y = int32(uint32(position >> 32)) + y;
        newPosition = (uint64(uint32(y)) << 32) + uint64(uint32(x));
    }
}

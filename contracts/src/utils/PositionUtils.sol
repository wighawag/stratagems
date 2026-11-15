// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

library PositionUtils {
    function toXY(uint64 position) internal pure returns (int32 x, int32 y) {
        x = int32(uint32(position) & 0xFFFFFFFF);
        y = int32(uint32(position >> 32));
    }

    function fromXY(int32 x, int32 y) internal pure returns (uint64 position) {
        position = (uint64(uint32(y)) << 32) + uint64(uint32(x));
    }

    function offset(
        uint64 position,
        int32 x,
        int32 y
    ) internal pure returns (uint64 newPosition) {
        x = int32(uint32(position) & 0xFFFFFFFF) + x;
        y = int32(uint32(position >> 32)) + y;
        newPosition = (uint64(uint32(y)) << 32) + uint64(uint32(x));
    }

    int32 constant ZONE_SIZE = 16;
    int32 constant ZONE_OFFSET = 8;

    function zoneCoord(int32 a) internal pure returns (int32 b) {
        if (a >= 0) {
            b = (a + ZONE_OFFSET) / ZONE_SIZE;
        } else {
            // b = -((-a + ZONE_OFFSET) / ZONE_SIZE);
            int256 absA = -a;
            int256 negPart = (absA + ZONE_OFFSET - 1) / ZONE_SIZE; // ceil division
            b = int32(-negPart);
        }
    }

    function zoneCoords(
        int32 x,
        int32 y
    ) internal pure returns (int32 zoneX, int32 zoneY) {
        zoneX = zoneCoord(x);
        zoneY = zoneCoord(y);
    }

    function getZone(uint64 position) internal pure returns (uint64 zone) {
        (int32 x, int32 y) = toXY(position);
        (int32 zoneX, int32 zoneY) = zoneCoords(x, y);
        zone = (uint64(uint32(zoneY)) << 32) + uint64(uint32(zoneX));
    }

    function getZone(int32 x, int32 y) internal pure returns (uint64 zone) {
        (int32 zoneX, int32 zoneY) = zoneCoords(x, y);
        zone = (uint64(uint32(zoneY)) << 32) + uint64(uint32(zoneX));
    }

    function zoneLocalCoord(int32 x) internal pure returns (uint8 index) {
        return uint8(uint32(x - (zoneCoord(x) * ZONE_SIZE - ZONE_OFFSET)));
    }

    function zoneLocalIndex(
        int32 x,
        int32 y
    ) internal pure returns (uint8 index) {
        uint8 zx = zoneLocalCoord(x);
        uint8 zy = zoneLocalCoord(y);
        return uint8(zy * uint32(ZONE_SIZE)) + zx;
    }

    function zoneLocalIndex(
        uint64 position
    ) internal pure returns (uint8 index) {
        (int32 x, int32 y) = toXY(position);
        return zoneLocalIndex(x, y);
    }
}

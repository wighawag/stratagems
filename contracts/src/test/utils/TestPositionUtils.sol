// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../../utils/PositionUtils.sol";

contract TestPositionUtils {
    using PositionUtils for uint64;

    function toXY(uint64 position) external pure returns (int32 x, int32 y) {
        return position.toXY();
    }

    function offset(uint64 position, int32 x, int32 y) external pure returns (uint64 newPosition) {
        return position.offset(x, y);
    }
}

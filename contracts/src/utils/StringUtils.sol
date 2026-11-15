// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";

library StringUtils {
    function toString(uint256 value) internal pure returns (string memory) {
        return Strings.toString(value);
    }

    function toString(int256 value) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    value < 0 ? "-" : "",
                    Strings.toString(SignedMath.abs(value))
                )
            );
    }

    function toHexString(uint256 value) internal pure returns (string memory) {
        return Strings.toHexString(value);
    }
}

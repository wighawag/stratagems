// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Guarded {
    function isGuardian(address sender, address newValue) internal view returns (bool) {
        address guardian;
        assembly {
            guardian := sload(0x8fbcb4375b910093bcf636b6b2f26b26eda2a29ef5a8ee7de44b5743c3bf9a27)
        }
        return guardian != address(0) && sender == guardian && newValue == address(0);
    }

    function isGuardian(address sender, uint256 newValue) internal view returns (bool) {
        address guardian;
        assembly {
            guardian := sload(0x8fbcb4375b910093bcf636b6b2f26b26eda2a29ef5a8ee7de44b5743c3bf9a27)
        }
        return guardian != address(0) && sender == guardian && newValue == 0;
    }
}

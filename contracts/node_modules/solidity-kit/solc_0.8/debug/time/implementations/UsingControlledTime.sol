// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../ERC173/internal/UsingInternalOwner.sol";
import "../interfaces/ITime.sol";

abstract contract UsingControlledTime is UsingInternalOwner, ITime, ITimeSetter {
    function timestamp() public view override returns (uint256) {
        return block.timestamp + _delta();
    }

    function increaseTime(uint256 delta) external override {
        require(msg.sender == _getOwner(), "NOT_AUTHORIZED");
        uint256 newDelta = _delta() + delta;
        assembly {
            sstore(0x112c413de07a110ce0a9ace0c01e41b5b59462770325b042f0dc72c337f55f2e, newDelta)
        }
        emit TimeIncreased(timestamp(), delta);
    }

    function _delta() internal view returns (uint256 delta) {
        assembly {
            // keccak256("time") - 1
            delta := sload(0x112c413de07a110ce0a9ace0c01e41b5b59462770325b042f0dc72c337f55f2e)
        }
    }
}

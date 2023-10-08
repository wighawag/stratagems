// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

abstract contract UsingVirtualTime {
	// TODO use hardhat-preprocessor

	function _timestamp() internal view returns (uint256) {
		uint256 delta;
		assembly {
			// keccak256("time") - 1
			delta := sload(0x112c413de07a110ce0a9ace0c01e41b5b59462770325b042f0dc72c337f55f2e)
		}
		return block.timestamp + delta;
	}
}

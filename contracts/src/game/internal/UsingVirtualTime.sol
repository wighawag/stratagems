// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/UsingStratagemsTypes.sol';

abstract contract UsingVirtualTime {
	// TODO use hardhat-preprocessor

	ITime immutable _time;

	constructor(UsingStratagemsTypes.Config memory config) {
		_time = config.time;
	}

	function _timestamp() internal view returns (uint256) {
		if (address(_time) == address(0)) {
			return block.timestamp;
		}
		return _time.timestamp();
	}
}

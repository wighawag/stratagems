// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './Stratagems.sol';
import 'solidity-kit/solc_0.8/debug/UsingControlledTime.sol';

contract Stratagems_debug is Stratagems, UsingControlledTime {
	constructor(Config memory config) Stratagems(config) {}

	function _getOwner() internal view override returns (address) {}
}

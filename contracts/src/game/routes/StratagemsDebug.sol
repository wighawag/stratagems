// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/debug/UsingControlledTime.sol';
import '../internal/StratagemsInternal.sol';

contract StratagemsDebug is StratagemsInternal, UsingControlledTime {
	constructor(Config memory config) StratagemsInternal(config) {}

	function _getOwner() internal view override returns (address ownerAddress) {
		// solhint-disable-next-line security/no-inline-assembly
		assembly {
			ownerAddress := sload(0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103)
		}
	}

	function forceMoves(address player, Move[] memory moves) external {
		require(msg.sender == _getOwner(), 'NOT_AUTHORIZED');
		(uint32 epoch, bool commiting) = _epoch();
		if (commiting) {
			epoch--;
		}
		_resolveMoves(player, epoch, moves);
	}
}

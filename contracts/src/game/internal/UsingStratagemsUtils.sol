// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/UsingStratagemsTypes.sol';

abstract contract UsingStratagemsUtils is UsingStratagemsTypes {
	function _checkHash(
		bytes24 commitmentHash,
		bytes32 secret,
		Move[] memory moves,
		bytes24 furtherMoves
	) internal pure {
		if (furtherMoves != bytes24(0)) {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves, furtherMoves)));
			require(commitmentHash == computedHash, 'HASH_NOT_MATCHING');
		} else {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves)));
			require(commitmentHash == computedHash, 'HASH_NOT_MATCHING');
		}
	}
}

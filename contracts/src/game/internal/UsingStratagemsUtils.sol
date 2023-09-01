// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/UsingStratagemsTypes.sol';
import '../interface/UsingStratagemsErrors.sol';

abstract contract UsingStratagemsUtils is UsingStratagemsTypes, UsingStratagemsErrors {
	function _checkHash(
		bytes24 commitmentHash,
		bytes32 secret,
		Move[] memory moves,
		bytes24 furtherMoves
	) internal pure {
		if (furtherMoves != bytes24(0)) {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves, furtherMoves)));
			if (commitmentHash != computedHash) {
				revert CommitmentHashNotMatching();
			}
		} else {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves)));
			if (commitmentHash != computedHash) {
				revert CommitmentHashNotMatching();
			}
		}
	}
}

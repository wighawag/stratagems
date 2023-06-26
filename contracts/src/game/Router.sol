// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

contract Router {
	bytes internal constant sigs = hex''; // 5bytes 4 byutes for the sig 1 byte for the index position in `addresses`
	bytes internal constant implementations = hex''; // implementations list

	fallback() external {
		uint32 sig = uint32(msg.sig);
		bytes memory implementationList = implementations;
		bytes memory sigList = sigs;
		uint256 numSigs = sigList.length / 5;

		assembly {
			let implementation
			sigList := add(sigList, 32)

			// TODO optimize via binary search (assimes the sigs are ordered)
			// could even generate the search code entirely (huff?)
			for {
				let i := 0
			} lt(i, numSigs) {
				i := add(i, 5)
			} {
				if eq(shr(224, mload(add(sigList, i))), sig) {
					let k := shr(248, mload(add(sigList, add(i, 4))))
					implementation := shr(96, mload(add(implementationList, add(32, mul(k, 160)))))
				}
			}

			// taken from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/8cab922347e79732f6a532a75da5081ba7447a71/contracts/proxy/Proxy.sol#L22-L45
			// Copy msg.data. We take full control of memory in this inline assembly
			// block because it will not return to Solidity code. We overwrite the
			// Solidity scratch pad at memory position 0.
			calldatacopy(0, 0, calldatasize())

			// Call the implementation.
			// out and outsize are 0 because we don't know the size yet.
			let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)

			// Copy the returned data.
			returndatacopy(0, 0, returndatasize())

			switch result
			// delegatecall returns 0 on error.
			case 0 {
				revert(0, returndatasize())
			}
			default {
				return(0, returndatasize())
			}
		}
	}
}

// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/UsingStratagemsTypes.sol';

contract UsingStratagemsStore is UsingStratagemsTypes {
	mapping(uint256 => Cell) internal _cells;
	mapping(uint256 => address) internal _owners;

	mapping(address => uint256) internal _tokensInReserve;
	mapping(address => Commitment) internal _commitments;
}

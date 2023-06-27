// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/StratagemsTypes.sol';

contract UsingStratagemsStore is StratagemsTypes {
	mapping(uint256 => Cell) internal _cells;
	mapping(uint256 => address) internal _owners;

	mapping(address => uint256) internal _tokensInReserve;
	mapping(address => Commitment) internal _commitments;
}

// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/StratagemsTypes.sol';

contract UsingStratagemsStore is StratagemsTypes {
	/// @notice There is (2**128) * (2**128) cells
	mapping(uint256 => Cell) internal _cells;
	/// @notice the number of token in reserve per account
	///  This is used to slash player who do not resolve their commit
	///  The amount can be greater than the number of token required for the next move
	///  This allow player to potentially hide their intention.
	mapping(address => uint256) internal _tokensInReserve;
	/// @notice The commitment to be resolved. zeroed if no commitment need to be made.
	mapping(address => Commitment) internal _commitments;
}

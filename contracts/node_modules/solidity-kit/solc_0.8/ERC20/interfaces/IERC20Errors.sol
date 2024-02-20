// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice The msg value do not match the expected value
/// @param provided msg.value amount provided
/// @param expected value expected
error InvalidMsgValue(uint256 provided, uint256 expected);
/// @notice The total amount provided do not match the expected value
/// @param provided msg.value amount provided
/// @param expected value expected
error InvalidTotalAmount(uint256 provided, uint256 expected);
/// @notice An invalid address is specified (for example: zero address)
/// @param addr invalid address
error InvalidAddress(address addr);
/// @notice the amount requested exceed the allowance
/// @param currentAllowance the current allowance
/// @param expected amount expected
error NotAuthorizedAllowance(uint256 currentAllowance, uint256 expected);
/// @notice the amount requested exceed the balance
/// @param currentBalance the current balance
/// @param expected amount expected
error NotEnoughTokens(uint256 currentBalance, uint256 expected);

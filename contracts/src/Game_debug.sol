// SPDX-License-Identifier: AGPL-1.0
pragma solidity ^0.8.13;

import "./Game.sol";

contract Game_debug is Game {
	constructor(Config memory config) Game(config) {}

	function _force_next() external {}

	function _period() internal view override returns (uint32 period, bool commiting) {
		uint256 periodDuration = COMMIT_PERIOD + RESOLUTION_PERIOD;
		require(block.timestamp >= START_TIME, "GAME_NOT_STARTED");
		uint256 timePassed = block.timestamp - START_TIME;
		period = uint32(timePassed / periodDuration + 1); // period start at 1
		commiting = timePassed - ((period - 1) * periodDuration) < COMMIT_PERIOD;
	}
}

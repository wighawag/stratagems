// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/IStratagems.sol';
import '../interface/UsingStratagemsTypes.sol';
import 'solidity-kit/solc_0.8/debug/time/interfaces/ITime.sol';

interface IStratagemsDebug is UsingStratagemsTypes, ITime, ITimeSetter {
	event ForceCells(DebugCell[] cells);
	event ForceSimpleCells(uint24 epoch, SimpleCell[] cells);

	function forceMoves(address player, Move[] memory moves) external;

	struct DebugCell {
		uint64 position;
		address owner;
		uint24 lastEpochUpdate;
		uint24 epochWhenTokenIsAdded;
		Color color;
		uint8 life;
		int8 delta;
		uint8 enemyMap;
	}

	function forceCells(DebugCell[] memory cells) external;

	struct SimpleCell {
		uint64 position;
		address owner;
		Color color;
		uint8 life;
	}

	function forceSimpleCells(SimpleCell[] memory cells) external;

	function getRawCell(uint256 id) external view returns (Cell memory cell);
}

interface IStratagemsWithDebug is IStratagems, IStratagemsDebug {}

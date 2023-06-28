// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/IStratagems.sol';
import '../interface/UsingStratagemsTypes.sol';

interface IStratagemsDebug is UsingStratagemsTypes {
	event ForceCells(DebugCell[] cells);
	event ForceSimpleCells(SimpleCell[] cells);

	function forceMoves(address player, Move[] memory moves, bool fromReserve) external;

	struct DebugCell {
		uint64 position;
		address owner;
		uint32 lastEpochUpdate;
		uint32 epochWhenTokenIsAdded;
		Color color;
		uint8 life;
		int8 delta;
		uint8 enemymask;
	}

	function forceCells(DebugCell[] memory cells) external;

	struct SimpleCell {
		uint64 position;
		address owner;
		Color color;
		uint8 life;
	}

	function forceSimpleCells(SimpleCell[] memory cells) external;
}

interface IStratagemsWithDebug is IStratagems, IStratagemsDebug {}

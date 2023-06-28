// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/debug/UsingControlledTime.sol';
import '../internal/UsingStratagemsSetters.sol';

contract StratagemsDebug is UsingStratagemsSetters, UsingControlledTime {
	constructor(Config memory config) UsingStratagemsSetters(config) {}

	event ForceCells(DebugCell[] cells);
	event ForceSimpleCells(SimpleCell[] cells);

	function _getOwner() internal view override returns (address ownerAddress) {
		// solhint-disable-next-line security/no-inline-assembly
		assembly {
			ownerAddress := sload(0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103)
		}
	}

	function forceMoves(address player, Move[] memory moves, bool fromReserve) external {
		require(msg.sender == _getOwner(), 'NOT_AUTHORIZED');
		(uint32 epoch, bool commiting) = _epoch();
		if (commiting) {
			epoch--;
		}
		_resolveMoves(player, epoch, moves, fromReserve);
	}

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

	function forceCells(DebugCell[] memory cells) external {
		require(msg.sender == _getOwner(), 'NOT_AUTHORIZED');
		for (uint256 i = 0; i < cells.length; i++) {
			DebugCell memory debugCell = cells[i];
			_cells[debugCell.position] = Cell({
				lastEpochUpdate: debugCell.lastEpochUpdate,
				epochWhenTokenIsAdded: debugCell.epochWhenTokenIsAdded,
				color: debugCell.color,
				life: debugCell.life,
				delta: debugCell.delta,
				enemymask: debugCell.enemymask
			});
			_owners[debugCell.position] = debugCell.owner;
		}
		emit ForceCells(cells);
	}

	struct SimpleCell {
		uint64 position;
		address owner;
		Color color;
		uint8 life;
	}

	function forceSimpleCells(SimpleCell[] memory cells) external {
		require(msg.sender == _getOwner(), 'NOT_AUTHORIZED');
		(uint32 epoch, bool commiting) = _epoch();
		require(commiting, 'NOT_ALLOWED_IN_RESOLUTION_PHASE');
		epoch--;

		TokenTransfer[] memory transfers = new TokenTransfer[](4);
		uint256 numAddressesToDistributeTo = 0;

		for (uint256 i = 0; i < cells.length; i++) {
			require(_cells[i].lastEpochUpdate == 0, 'NO_OVERWRITE');
			SimpleCell memory simpleCell = cells[i];

			(int8 newDelta, uint8 newEnemymask, uint256 newNumAddressesToDistributeTo) = _updateNeighbours(
				transfers,
				numAddressesToDistributeTo,
				simpleCell.position,
				epoch,
				Color.None,
				simpleCell.color
			);
			numAddressesToDistributeTo = newNumAddressesToDistributeTo;

			_cells[simpleCell.position] = Cell({
				lastEpochUpdate: epoch,
				epochWhenTokenIsAdded: epoch,
				color: simpleCell.color,
				life: simpleCell.life,
				delta: newDelta,
				enemymask: newEnemymask
			});
			_owners[simpleCell.position] = simpleCell.owner;
		}

		_multiTransfer(transfers, numAddressesToDistributeTo);
		emit ForceSimpleCells(cells);
	}
}

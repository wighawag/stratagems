import {zeroAddress} from 'viem';
import {ContractSimpleCell} from './grid';
import {CellXYPosition, Color, ContractCell, ContractMove, StratagemsState} from './types';
import {EVIL_OWNER_ADDRESS} from './constants';

export function bigIntIDToXYID(position: bigint): string {
	const {x, y} = bigIntIDToXY(position);
	return '' + x + ',' + y;
}

export function countBits(n: number): number {
	let count = 0;
	while (n != 0) {
		n = n & (n - 1);
		count++;
	}
	return count;
}

// using 64 bits room id
// const leftMostBit = BigInt('0x8000000000000000');
// const bn32 = BigInt('0x10000000000000000');
export function bigIntIDToXY(position: bigint): CellXYPosition {
	const bn = BigInt(position);
	const x = Number(BigInt.asIntN(32, bn));
	const y = Number(BigInt.asIntN(32, bn >> 32n));
	// const rx = x >= leftMostBit ? -(bn32 - x) : x;
	// const ry = y >= leftMostBit ? -(bn32 - y) : y;
	return {x, y};
}

export type CellBigIntXYPosition = {
	x: bigint;
	y: bigint;
};

export function bigIntIDToBigintXY(position: bigint): CellBigIntXYPosition {
	const bn = BigInt(position);
	const x = BigInt.asIntN(32, bn);
	const y = BigInt.asIntN(32, bn >> 32n);
	return {x, y};
}

export function xyToXYID(x: number, y: number) {
	return '' + x + ',' + y;
}

export function IDToXY(id: string) {
	const [x, y] = id.split(',').map(Number);
	return {x, y};
}

export function xyToBigIntID(x: number, y: number): bigint {
	// const bn = (BigInt.asUintN(32, BigInt(x)) + BigInt.asUintN(32, BigInt(y))) << 32n;
	const bn = (x < 0 ? 2n ** 32n + BigInt(x) : BigInt(x)) + ((y < 0 ? 2n ** 32n + BigInt(y) : BigInt(y)) << 32n);
	return bn;
}

export class StratagemsContract {
	constructor(
		private state: StratagemsState,
		public MAX_LIFE: number,
	) {}

	_effectiveDelta(delta: number, enemyMap: number): number {
		let effectiveDelta = delta > 0 ? 1 : -1;
		// let effectiveDelta = delta != 0 ? delta : -1;
		if (effectiveDelta < 0 && enemyMap == 0) {
			effectiveDelta = 1;
			// effectiveDelta = 0;
		}
		return effectiveDelta;
	}

	computeNewLife(
		lastUpdate: number,
		enemyMap: number,
		delta: number,
		life: number,
		cycle: number,
	): {newLife: number; cycleUsed: number} {
		const MAX_LIFE = this.MAX_LIFE;

		const data = {
			newLife: life,
			cycleUsed: lastUpdate,
		};
		if (lastUpdate >= 1 && life > 0) {
			let cycleDelta = cycle - lastUpdate;
			if (cycleDelta > 0) {
				const effectiveDelta = this._effectiveDelta(delta, enemyMap);
				if (effectiveDelta > 0) {
					// if (life < MAX_LIFE) {
					const maxCycle = MAX_LIFE - life + Math.floor((effectiveDelta - 1) / effectiveDelta);
					if (cycleDelta > maxCycle) {
						cycleDelta = maxCycle;
					}

					life += cycleDelta * effectiveDelta;
					if (life > MAX_LIFE) {
						life = MAX_LIFE;
					}
					data.newLife = life;

					// we don not use the following: lastUpdate + cycleDelta;
					//   because no state change is foreseen with no life increase
					data.cycleUsed = cycle;
					// } else {
					// 	data.newLife = life;
					// 	data.cycleUsed = lastUpdate;
					// }
				} else if (effectiveDelta < 0) {
					const numCycleBeforeDying = life + Math.floor((-effectiveDelta - 1) / -effectiveDelta);
					if (cycleDelta > numCycleBeforeDying) {
						cycleDelta = numCycleBeforeDying;
					}
					const lifeLoss = cycleDelta * -effectiveDelta;
					if (lifeLoss > life) {
						data.newLife = 0;
					} else {
						data.newLife = life - lifeLoss;
					}

					// since we need to track when the cell died, we upate lastUpdate only to
					//   the corresponding cycle where life reached 0
					data.cycleUsed = lastUpdate + cycleDelta;
				} else {
					data.newLife = life;

					// we don not use the following: lastUpdate + cycleDelta;
					//   because no state change is foreseen with no life change
					data.cycleUsed = cycle;
				}
			} else {
				data.newLife = life;

				// no change, no need to update lastUpdate either ?
				data.cycleUsed = lastUpdate;
			}
		}

		return data;
	}

	getCellInMemory(position: bigint): ContractCell {
		const cell: ContractCell | null = this.state.cells[position.toString()];
		return {
			lastCycleUpdate: cell?.lastCycleUpdate || 0,
			color: cell?.color || Color.None,
			delta: cell?.delta || 0,
			enemyMap: cell?.enemyMap || 0,
			cycleWhenTokenIsAdded: cell?.cycleWhenTokenIsAdded || 0,
			life: cell?.life || 0,
			distribution: cell?.distribution || 0,
			stake: cell?.stake || 0,
			producingCycles: cell?.producingCycles || 0,
		};
	}

	getUpdatedCell(position: bigint, cycle: number) {
		const updatedCell = this.getCellInMemory(position);
		let justDied = false;
		const lastUpdate = updatedCell.lastCycleUpdate;
		const delta = updatedCell.delta;
		const life = updatedCell.life;

		if (lastUpdate >= 1 && life > 0) {
			const {newLife} = this.computeNewLife(
				updatedCell.lastCycleUpdate,
				updatedCell.enemyMap,
				updatedCell.delta,
				updatedCell.life,
				cycle,
			);
			updatedCell.life = newLife;
			updatedCell.lastCycleUpdate = cycle;
			justDied = newLife == 0;
		}

		const effectiveDelta = this._effectiveDelta(updatedCell.delta, updatedCell.enemyMap);
		if (effectiveDelta > 0) {
			updatedCell.producingCycles += cycle - lastUpdate;
		}

		return {updatedCell, justDied};
	}

	ownerOf(position: bigint) {
		return this.state.owners[position.toString()] || zeroAddress;
	}

	addPoints(owner: `0x${string}`, points: number) {
		let existingPoints = this.state.computedPoints[owner] || 0;
		this.state.computedPoints[owner] = existingPoints + points;
	}
	removePoints(owner: `0x${string}`, points: number) {
		let existingPoints = this.state.computedPoints[owner] || 0; // TODO error
		this.state.computedPoints[owner] = existingPoints - points;
	}

	updateCellFromNeighbor(
		position: bigint,
		cell: ContractCell,
		newLife: number,
		cycle: number,
		neighbourIndex: number,
		oldColor: Color,
		newColor: Color,
	): number {
		// const {x, y} = bigIntIDToXY(position);
		// console.log(`updateCellFromNeighbor ${x},${y}`, cell);
		let due = 0;
		if (cell.life > 0 && newLife == 0) {
			// we just died, we establish the distributionMap and counts
			cell.distribution = (cell.enemyMap << 4) + countBits(cell.enemyMap);
		}

		if (((cell.distribution >> 4) & (2 ** neighbourIndex)) == 2 ** neighbourIndex) {
			due = 12 / (cell.distribution & 0x0f);
			cell.distribution = ((cell.distribution >> 4) & (~(2 ** neighbourIndex) << 4)) + (cell.distribution & 0x0f);
		}

		const oldEffectiveDelta = this._effectiveDelta(cell.delta, cell.enemyMap);

		if (oldColor != newColor) {
			if (newColor == Color.None) {
				if (cell.color == oldColor) {
					cell.delta -= 1;
				} else {
					cell.delta += 1;
					cell.enemyMap = cell.enemyMap & ((1 << neighbourIndex) ^ 0xff);
				}
			} else if (cell.color == oldColor) {
				// then newColor is different (see assert above)
				cell.enemyMap = cell.enemyMap | (1 << neighbourIndex);
				cell.delta -= 2;
			} else if (cell.color == newColor) {
				// then old color was different
				cell.delta += oldColor == Color.None ? 1 : 2;
				cell.enemyMap = cell.enemyMap & ((1 << neighbourIndex) ^ 0xff);
			} else if (oldColor == Color.None) {
				// if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
				cell.delta -= 1;
				cell.enemyMap = cell.enemyMap | (1 << neighbourIndex);
			}
		}

		const owner = this.ownerOf(position);
		if (owner != zeroAddress && newLife > 0) {
			const newEffectiveDelta = this._effectiveDelta(cell.delta, cell.enemyMap);
			if (oldEffectiveDelta > 0 && newEffectiveDelta <= 0) {
				this.removePoints(owner, cell.stake); // GENERATOR.remove(owner, NUM_TOKENS_PER_GEMS * cell.stake);
			} else if (oldEffectiveDelta <= 0 && newEffectiveDelta > 0) {
				this.addPoints(owner, cell.stake); // GENERATOR.add(owner, NUM_TOKENS_PER_GEMS * cell.stake);
			}
		}

		if (oldEffectiveDelta > 0) {
			cell.producingCycles += cycle - cell.lastCycleUpdate;
		}

		cell.lastCycleUpdate = cycle;
		cell.life = newLife;
		this.state.cells[position.toString()] = cell;
		// console.log(`AFTER updateCellFromNeighbor `, cell);
		// console.log(`AFTER updateCellFromNeighbor `, this.getUpdatedCell(position, cycle));
		return due;
	}

	updateCell(position: bigint, cycle: number, neighbourIndex: number, oldColor: Color, newColor: Color) {
		const data = {
			enemyOrFriend: 0,
			due: 0,
		};
		const cell = this.getCellInMemory(position);

		const lastUpdate = cell.lastCycleUpdate;
		const color = cell.color;
		if (color != Color.None) {
			data.enemyOrFriend = color == newColor ? 1 : -1;
		}

		if (lastUpdate >= 1 && color != Color.None) {
			// we only consider cell with color that are not dead
			if (cell.life > 0 && lastUpdate < cycle) {
				// of there is life to update we compute the new life
				const {newLife} = this.computeNewLife(lastUpdate, cell.enemyMap, cell.delta, cell.life, cycle);
				data.due = this.updateCellFromNeighbor(position, cell, newLife, cycle, neighbourIndex, oldColor, newColor);
			} else {
				data.due = this.updateCellFromNeighbor(position, cell, cell.life, cycle, neighbourIndex, oldColor, newColor);
			}
		}

		return data;
	}

	updateNeighbours(
		position: bigint,
		cycle: number,
		oldColor: Color,
		newColor: Color,
		distribution: number,
	): {newComputedDelta: number; newComputedEnemyMap: number; numDue: number} {
		const {x, y} = bigIntIDToXY(position);
		// console.log(`updating neighbors of ${x},${y}`);
		const data = {
			newComputedDelta: 0,
			newComputedEnemyMap: 0,
			numDue: 0,
		};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const {enemyOrFriend, due} = this.updateCell(upPosition, cycle, 2, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 1;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 4) == 4) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const leftPosition = xyToBigIntID(x - 1, y);
			const {enemyOrFriend, due} = this.updateCell(leftPosition, cycle, 3, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 2;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 8) == 8) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const downPosition = xyToBigIntID(x, y + 1);
			const {enemyOrFriend, due} = this.updateCell(downPosition, cycle, 0, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 4;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 1) == 1) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const rightPosition = xyToBigIntID(x + 1, y);
			const {enemyOrFriend, due} = this.updateCell(rightPosition, cycle, 1, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 8;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 2) == 2) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		return data;
	}

	propagate(move: ContractMove, cycle: number, color: Color, distribution: number) {
		const data = {
			newDelta: 0,
			newEnemyMap: 0,
		};

		const {
			newComputedDelta,
			newComputedEnemyMap,
			numDue,
			// ownersToPay
		} = this.updateNeighbours(move.position, cycle, color, move.color, distribution);

		// if (numDue > 0) {
		// 	_collectTransfer(
		// 		transferCollection,
		// 		TokenTransfer({to: payable(_ownerOf(move.position)), amount: (numDue * NUM_TOKENS_PER_GEMS) / 12})
		// 	);
		// }
		// for (uint8 i = 0; i < 4; i++) {
		// 	if (ownersToPay[i] != address(0)) {
		// 		_collectTransfer(
		// 			transferCollection,
		// 			TokenTransfer({to: payable(ownersToPay[i]), amount: (NUM_TOKENS_PER_GEMS / (distribution & 0x0f))})
		// 		);
		// 	}
		// }
		data.newDelta = newComputedDelta;
		data.newEnemyMap = newComputedEnemyMap;

		return data;
	}

	/**
	 * The contract's `_computeMove`, rule for rule (contracts/src/game/internal/UsingStratagemsSetters.sol):
	 * a move is judged against the cell as it stood before the first move on it in the cycle,
	 * so the board after a cycle does not depend on the order its reveals arrive in.
	 * Payouts are not modelled here; points are, as a holding.
	 */
	computeMove(player: `0x${string}`, cycle: number, moveAsInput: ContractMove) {
		const move = {...moveAsInput};
		const MAX_LIFE = this.MAX_LIFE;
		const key = move.position.toString();
		const isPlayer = (address: string) => address.toLowerCase() == player.toLowerCase();

		const {updatedCell: currentState, justDied} = this.getUpdatedCell(move.position, cycle);

		this.state.cellsAtCycleStart = this.state.cellsAtCycleStart || {};
		let start = this.state.cellsAtCycleStart[key];
		const firstMoveThisCycle = !start || start.cycle != cycle;
		if (firstMoveThisCycle) {
			start = {owner: this.ownerOf(move.position), cycle, life: currentState.life};
		}

		if (start.life != 0) {
			// alive at the start: its owner's alone this cycle
			if (!isPlayer(start.owner)) {
				return;
			}
			if (move.color == Color.None) {
				if (start.life != MAX_LIFE || currentState.life == 0 || !isPlayer(this.ownerOf(move.position))) {
					return;
				}
			}
		} else {
			// dead or empty at the start: free
			if (move.color == Color.None) {
				return;
			}
			if (currentState.cycleWhenTokenIsAdded == cycle && currentState.life != 0) {
				// already placed on in this cycle: a collision
				move.color = Color.Evil;
			}
		}

		if (firstMoveThisCycle) {
			this.state.cellsAtCycleStart[key] = start;
		}

		// we might have distribution still to do
		let distribution = currentState.distribution;
		if (justDied) {
			distribution = (currentState.enemyMap << 4) + countBits(currentState.enemyMap);
			currentState.lastCycleUpdate = 0;
		}

		const {newDelta, newEnemyMap} = this.propagate(move, cycle, currentState.color, distribution);

		const currentOwner = this.ownerOf(move.position);
		const oldLife = currentState.life;
		const oldStake = currentState.stake;
		const oldEffectiveDelta = this._effectiveDelta(currentState.delta, currentState.enemyMap);

		currentState.color = move.color;
		currentState.distribution = 0;
		if (!(isPlayer(currentOwner) && currentState.life > 0)) {
			currentState.cycleWhenTokenIsAdded = cycle;
		}

		if (currentState.color == Color.None) {
			currentState.producingCycles += cycle - currentState.lastCycleUpdate;
			currentState.life = 0;
			currentState.stake = 0;
			currentState.lastCycleUpdate = 0;
			currentState.delta = 0;
			currentState.enemyMap = 0;
			this.setPoints(currentOwner, oldLife, oldStake, oldEffectiveDelta, zeroAddress, 0, 0, 0);
			this.state.owners[key] = zeroAddress;
		} else {
			currentState.enemyMap = newEnemyMap;
			if (currentState.color == Color.Evil && oldLife != 0) {
				currentState.stake += 1;
				if (currentState.stake > 255) {
					currentState.stake = 255;
				}
			} else {
				currentState.stake = 1;
				currentState.producingCycles = 0;
			}
			currentState.delta = newDelta;
			currentState.life = 2;
			currentState.lastCycleUpdate = cycle;

			const newOwner = currentState.color == Color.Evil ? EVIL_OWNER_ADDRESS : player;
			this.setPoints(
				currentOwner,
				oldLife,
				oldStake,
				oldEffectiveDelta,
				newOwner,
				currentState.life,
				currentState.stake,
				this._effectiveDelta(currentState.delta, currentState.enemyMap),
			);
			this.state.owners[key] = newOwner;
		}

		this.state.cells[key] = currentState;
	}

	/** The contract's `_setPoints`: an owner holds `stake` points exactly while the cell is alive and producing. */
	setPoints(
		oldOwner: `0x${string}`,
		oldLife: number,
		oldStake: number,
		oldEffectiveDelta: number,
		newOwner: `0x${string}`,
		newLife: number,
		newStake: number,
		newEffectiveDelta: number,
	) {
		const oldHolding = oldOwner != zeroAddress && oldLife > 0 && oldEffectiveDelta > 0 ? oldStake : 0;
		const newHolding = newOwner != zeroAddress && newLife > 0 && newEffectiveDelta > 0 ? newStake : 0;
		if (oldOwner.toLowerCase() == newOwner.toLowerCase()) {
			if (newHolding > oldHolding) this.addPoints(newOwner, newHolding - oldHolding);
			else if (oldHolding > newHolding) this.removePoints(oldOwner, oldHolding - newHolding);
		} else {
			if (oldHolding != 0) this.removePoints(oldOwner, oldHolding);
			if (newHolding != 0) this.addPoints(newOwner, newHolding);
		}
	}

	// ----------------------

	forceSimpleCells(cycle: number, cells: readonly ContractSimpleCell[]) {
		for (const simpleCell of cells) {
			const {delta, enemyMap} = this.updateNeighbosrDelta(simpleCell.position, simpleCell.color, cycle);

			this.state.cells[simpleCell.position.toString()] = {
				lastCycleUpdate: cycle,
				cycleWhenTokenIsAdded: cycle,
				color: simpleCell.color,
				life: simpleCell.life,
				delta: delta,
				enemyMap: enemyMap,
				distribution: 0,
				stake: simpleCell.stake,
				producingCycles: 0, // THIS IS FALSE but we go with it
			};
			this.state.owners[simpleCell.position.toString()] = simpleCell.owner;
			// console.log({
			// 	FORCE_FIRST: 'FORCE_FIRST',
			// 	position: bigIntIDToXY(simpleCell.position),
			// 	cell: this.getCellInMemory(simpleCell.position),
			// });
		}

		for (const simpleCell of cells) {
			const cell = this.getCellInMemory(simpleCell.position);

			// we act as if the token were added in previous cycles
			// this is so it does not affect the reveal phase
			const effectiveDelta = this._effectiveDelta(cell.delta, cell.enemyMap);
			let potentialLife = cell.life - effectiveDelta;
			if (potentialLife < 0) {
				potentialLife = 0;
			}
			cell.life = potentialLife;

			const newCell = {
				lastCycleUpdate: cycle - 1,
				cycleWhenTokenIsAdded: cycle - 1,
				color: cell.color,
				life: cell.life,
				delta: cell.delta,
				enemyMap: cell.enemyMap,
				distribution: 0,
				stake: cell.stake,
				producingCycles: 0,
			};

			if (this._effectiveDelta(newCell.delta, newCell.enemyMap) > 0) {
				newCell.producingCycles = 1;
			}

			this.state.cells[simpleCell.position.toString()] = newCell;
			// const {x, y} = bigIntIDToXY(simpleCell.position);
			// console.log(`forceSimpleCell ${x}, ${y}`, newCell);

			// console.log({
			// 	FORCE: 'FORCE',
			// 	position: bigIntIDToXY(simpleCell.position),
			// 	cell: this.getCellInMemory(simpleCell.position),
			// });
		}
	}

	updateNeighbosrDelta(center: bigint, color: Color, cycle: number): {delta: number; enemyMap: number} {
		const {x, y} = bigIntIDToXY(center);
		const data = {delta: 0, enemyMap: 0};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const cell = this.getCellInMemory(upPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 1;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(upPosition, cell, cell.life, cycle, 2, Color.None, color);
			}
		}
		{
			const leftPosition = xyToBigIntID(x - 1, y);
			const cell = this.getCellInMemory(leftPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 2;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(leftPosition, cell, cell.life, cycle, 3, Color.None, color);
			}
		}

		{
			const downPosition = xyToBigIntID(x, y + 1);
			const cell = this.getCellInMemory(downPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 4;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(downPosition, cell, cell.life, cycle, 0, Color.None, color);
			}
		}
		{
			const rightPosition = xyToBigIntID(x + 1, y);
			const cell = this.getCellInMemory(rightPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 8;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(rightPosition, cell, cell.life, cycle, 1, Color.None, color);
			}
		}
		return data;
	}

	poke(position: bigint, cycle: number) {
		const {updatedCell: currentState, justDied} = this.getUpdatedCell(position, cycle);

		// we might have distribution still to do
		let distribution = currentState.distribution;
		if (justDied) {
			// if we just died
			// we have to distribute to all
			// its lastCycleUpdate stays the cycle (alpha1 zeroed it here: see the contract's _poke)
			distribution = (currentState.enemyMap << 4) + countBits(currentState.enemyMap);
		}

		const {
			numDue,
			// ownersToPay
		} = this.updateNeighbours(position, cycle, currentState.color, currentState.color, distribution);

		// if (numDue > 0) {
		//     _collectTransfer(
		//         transferCollection,
		//         TokenTransfer({to: payable(_ownerOf(position)), amount: numDue * NUM_TOKENS_PER_GEMS})
		//     );
		// }

		// for (uint8 i = 0; i < 4; i++) {
		//     if (ownersToPay[i] != address(0)) {
		//         _collectTransfer(
		//             transferCollection,
		//             TokenTransfer({to: payable(ownersToPay[i]), amount: NUM_TOKENS_PER_GEMS})
		//         );
		//     }
		// }

		currentState.distribution = 0;
		this.state.cells[position.toString()] = currentState;
	}

	isEnemyOrFriend(a: Color, b: Color) {
		if (a != Color.None && b != Color.None) {
			return a == b ? 1 : -1;
		}
		return 0;
	}
}

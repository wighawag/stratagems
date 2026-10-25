/**
 * `StratagemsContract` (`stratagems-common`) ported to the entity model's
 * `MutationContext`: the same traversal, line for line, with every state read an
 * `await` and every state write a `set`.
 *
 * Taken from etherfold's stratagems conformance workload
 * (`packages/conformance-workload-stratagems/src/stratagems-contract.ts`), which is
 * itself a derived work of `common/src/stratagems.ts` here, and which etherfold
 * checks against the state the original JS processor computed on Base.
 *
 * The synchronous `StratagemsContract` in `stratagems-common` stays: the web app
 * runs it over the state it READ, to preview moves that are not on chain yet.
 * This one runs inside the fold, where a read is a round trip to the store.
 */
import type {MutationContext} from '@etherfold/processor-entities';
// Deep imports of the SOURCE modules, not the package entry: this file is bundled
// into the processor bundle, and `stratagems-common`'s entry also carries the
// commitment helpers, which import node's `crypto`.
import {EVIL_OWNER_ADDRESS} from 'stratagems-common/src/constants';
import {bigIntIDToXY, countBits, xyToBigIntID} from 'stratagems-common/src/stratagems';
import {Color, type CellAtCycleStart, type ContractCell, type ContractMove} from 'stratagems-common/src/types';
import type {ContractSimpleCell} from 'stratagems-common/src/grid';

const zeroAddress = '0x0000000000000000000000000000000000000000' as const;

const CELL_FIELDS = [
	'lastCycleUpdate',
	'cycleWhenTokenIsAdded',
	'color',
	'life',
	'delta',
	'enemyMap',
	'distribution',
	'stake',
	'producingCycles',
] as const;

function rowToCell(row: Record<string, unknown> | undefined): ContractCell {
	return {
		lastCycleUpdate: Number(row?.lastCycleUpdate ?? 0),
		cycleWhenTokenIsAdded: Number(row?.cycleWhenTokenIsAdded ?? 0),
		color: Number(row?.color ?? 0),
		life: Number(row?.life ?? 0),
		delta: Number(row?.delta ?? 0),
		enemyMap: Number(row?.enemyMap ?? 0),
		distribution: Number(row?.distribution ?? 0),
		stake: Number(row?.stake ?? 0),
		producingCycles: Number(row?.producingCycles ?? 0),
	};
}

function cellToRow(cell: ContractCell): Record<string, unknown> {
	const row: Record<string, unknown> = {};
	for (const field of CELL_FIELDS) {
		row[field] = cell[field];
	}
	return row;
}

export class StratagemsContractOnEntities {
	constructor(
		private ctx: MutationContext,
		public MAX_LIFE: number,
	) {}

	_effectiveDelta(delta: number, enemyMap: number): number {
		let effectiveDelta = delta > 0 ? 1 : -1;
		if (effectiveDelta < 0 && enemyMap == 0) {
			effectiveDelta = 1;
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
					const maxCycle = MAX_LIFE - life + Math.floor((effectiveDelta - 1) / effectiveDelta);
					if (cycleDelta > maxCycle) {
						cycleDelta = maxCycle;
					}

					life += cycleDelta * effectiveDelta;
					if (life > MAX_LIFE) {
						life = MAX_LIFE;
					}
					data.newLife = life;
					data.cycleUsed = cycle;
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
					data.cycleUsed = lastUpdate + cycleDelta;
				} else {
					data.newLife = life;
					data.cycleUsed = cycle;
				}
			} else {
				data.newLife = life;
				data.cycleUsed = lastUpdate;
			}
		}

		return data;
	}

	/** A read that must NOT create a row: an absent cell reads as the zero cell. */
	async getCellInMemory(position: bigint): Promise<ContractCell> {
		const row = await this.ctx.get('cell', {position: position.toString()});
		return rowToCell(row as Record<string, unknown> | undefined);
	}

	async putCell(position: bigint, cell: ContractCell): Promise<void> {
		this.ctx.set('cell', {position: position.toString()}, cellToRow(cell));
	}

	async getUpdatedCell(position: bigint, cycle: number) {
		const updatedCell = await this.getCellInMemory(position);
		let justDied = false;
		const lastUpdate = updatedCell.lastCycleUpdate;
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
			// producing time accrues where lastCycleUpdate moves, and only there (see the contract's _getUpdatedCell)
			const effectiveDelta = this._effectiveDelta(updatedCell.delta, updatedCell.enemyMap);
			if (effectiveDelta > 0) {
				updatedCell.producingCycles += cycle - lastUpdate;
			}
		}

		return {updatedCell, justDied};
	}

	async ownerOf(position: bigint): Promise<`0x${string}`> {
		const row = (await this.ctx.get('cellOwner', {position: position.toString()})) as
			| {owner: `0x${string}`}
			| undefined;
		return row?.owner || zeroAddress;
	}

	async setOwner(position: bigint, owner: `0x${string}`): Promise<void> {
		this.ctx.set('cellOwner', {position: position.toString()}, {owner});
	}

	async addPoints(owner: `0x${string}`, points: number): Promise<void> {
		const row = (await this.ctx.get('computedPoints', {owner})) as {points: number} | undefined;
		const existingPoints = Number(row?.points ?? 0);
		this.ctx.set('computedPoints', {owner}, {points: existingPoints + points});
	}

	async removePoints(owner: `0x${string}`, points: number): Promise<void> {
		const row = (await this.ctx.get('computedPoints', {owner})) as {points: number} | undefined;
		const existingPoints = Number(row?.points ?? 0);
		this.ctx.set('computedPoints', {owner}, {points: existingPoints - points});
	}

	async updateCellFromNeighbor(
		position: bigint,
		cell: ContractCell,
		newLife: number,
		cycle: number,
		neighbourIndex: number,
		oldColor: Color,
		newColor: Color,
	): Promise<number> {
		let due = 0;
		if (cell.life > 0 && newLife == 0) {
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
				cell.enemyMap = cell.enemyMap | (1 << neighbourIndex);
				cell.delta -= 2;
			} else if (cell.color == newColor) {
				cell.delta += oldColor == Color.None ? 1 : 2;
				cell.enemyMap = cell.enemyMap & ((1 << neighbourIndex) ^ 0xff);
			} else if (oldColor == Color.None) {
				cell.delta -= 1;
				cell.enemyMap = cell.enemyMap | (1 << neighbourIndex);
			}
		}

		const owner = await this.ownerOf(position);
		if (owner != zeroAddress && newLife > 0) {
			const newEffectiveDelta = this._effectiveDelta(cell.delta, cell.enemyMap);
			if (oldEffectiveDelta > 0 && newEffectiveDelta <= 0) {
				await this.removePoints(owner, cell.stake);
			} else if (oldEffectiveDelta <= 0 && newEffectiveDelta > 0) {
				await this.addPoints(owner, cell.stake);
			}
		}

		if (oldEffectiveDelta > 0) {
			cell.producingCycles += cycle - cell.lastCycleUpdate;
		}

		cell.lastCycleUpdate = cycle;
		cell.life = newLife;
		await this.putCell(position, cell);
		return due;
	}

	async updateCell(position: bigint, cycle: number, neighbourIndex: number, oldColor: Color, newColor: Color) {
		const data = {
			enemyOrFriend: 0,
			due: 0,
		};
		const cell = await this.getCellInMemory(position);

		const lastUpdate = cell.lastCycleUpdate;
		const color = cell.color;
		if (color != Color.None) {
			data.enemyOrFriend = color == newColor ? 1 : -1;
		}

		if (lastUpdate >= 1 && color != Color.None) {
			if (cell.life > 0 && lastUpdate < cycle) {
				const {newLife} = this.computeNewLife(lastUpdate, cell.enemyMap, cell.delta, cell.life, cycle);
				data.due = await this.updateCellFromNeighbor(
					position,
					cell,
					newLife,
					cycle,
					neighbourIndex,
					oldColor,
					newColor,
				);
			} else {
				data.due = await this.updateCellFromNeighbor(
					position,
					cell,
					cell.life,
					cycle,
					neighbourIndex,
					oldColor,
					newColor,
				);
			}
		}

		return data;
	}

	async updateNeighbours(
		position: bigint,
		cycle: number,
		oldColor: Color,
		newColor: Color,
		distribution: number,
	): Promise<{newComputedDelta: number; newComputedEnemyMap: number; numDue: number}> {
		const {x, y} = bigIntIDToXY(position);
		const data = {
			newComputedDelta: 0,
			newComputedEnemyMap: 0,
			numDue: 0,
		};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const {enemyOrFriend, due} = await this.updateCell(upPosition, cycle, 2, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 1;
			}
			data.numDue += due;
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const leftPosition = xyToBigIntID(x - 1, y);
			const {enemyOrFriend, due} = await this.updateCell(leftPosition, cycle, 3, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 2;
			}
			data.numDue += due;
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const downPosition = xyToBigIntID(x, y + 1);
			const {enemyOrFriend, due} = await this.updateCell(downPosition, cycle, 0, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 4;
			}
			data.numDue += due;
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const rightPosition = xyToBigIntID(x + 1, y);
			const {enemyOrFriend, due} = await this.updateCell(rightPosition, cycle, 1, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 8;
			}
			data.numDue += due;
			data.newComputedDelta += enemyOrFriend;
		}

		return data;
	}

	async propagate(move: ContractMove, cycle: number, color: Color, distribution: number) {
		const data = {
			newDelta: 0,
			newEnemyMap: 0,
		};

		const {newComputedDelta, newComputedEnemyMap} = await this.updateNeighbours(
			move.position,
			cycle,
			color,
			move.color,
			distribution,
		);

		data.newDelta = newComputedDelta;
		data.newEnemyMap = newComputedEnemyMap;

		return data;
	}

	/** The cell before the first move on it in `cycle`, or undefined if no move of `cycle` has touched it. */
	async cellAtCycleStart(position: bigint, cycle: number): Promise<CellAtCycleStart | undefined> {
		const row = (await this.ctx.get('cellAtCycleStart', {position: position.toString()})) as
			| {owner: `0x${string}`; cycle: number; life: number}
			| undefined;
		if (!row || Number(row.cycle) != cycle) return undefined;
		return {owner: row.owner, cycle: Number(row.cycle), life: Number(row.life)};
	}

	/**
	 * The contract's `_computeMove` (contracts/src/game/internal/UsingStratagemsSetters.sol), rule for rule:
	 * a move is judged against the cell as it stood before the first move on it in the cycle.
	 */
	async computeMove(player: `0x${string}`, cycle: number, moveAsInput: ContractMove): Promise<void> {
		const move = {...moveAsInput};
		const MAX_LIFE = this.MAX_LIFE;
		const isPlayer = (address: string) => address.toLowerCase() == player.toLowerCase();

		const {updatedCell: currentState, justDied} = await this.getUpdatedCell(move.position, cycle);

		let start = await this.cellAtCycleStart(move.position, cycle);
		const firstMoveThisCycle = start === undefined;
		if (start === undefined) {
			start = {owner: await this.ownerOf(move.position), cycle, life: currentState.life};
		}

		if (start.life != 0) {
			if (!isPlayer(start.owner)) return;
			if (move.color == Color.None) {
				if (start.life != MAX_LIFE || currentState.life == 0 || !isPlayer(await this.ownerOf(move.position))) {
					return;
				}
			}
		} else {
			if (move.color == Color.None) return;
			if (currentState.cycleWhenTokenIsAdded == cycle && currentState.life != 0) {
				move.color = Color.Evil;
			}
		}

		if (firstMoveThisCycle) {
			this.ctx.set('cellAtCycleStart', {position: move.position.toString()}, start);
		}

		let distribution = currentState.distribution;
		if (justDied) {
			distribution = (currentState.enemyMap << 4) + countBits(currentState.enemyMap);
			currentState.lastCycleUpdate = 0;
		}

		const {newDelta, newEnemyMap} = await this.propagate(move, cycle, currentState.color, distribution);

		const currentOwner = await this.ownerOf(move.position);
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
			await this.setPoints(currentOwner, oldLife, oldStake, oldEffectiveDelta, zeroAddress, 0, 0, 0);
			await this.setOwner(move.position, zeroAddress);
		} else {
			currentState.enemyMap = newEnemyMap;
			if (currentState.color == Color.Evil && oldLife != 0) {
				currentState.stake += 1;
				if (currentState.stake > 255) currentState.stake = 255;
			} else {
				currentState.stake = 1;
				currentState.producingCycles = 0;
			}
			currentState.delta = newDelta;
			currentState.life = 2;
			currentState.lastCycleUpdate = cycle;

			const newOwner = currentState.color == Color.Evil ? EVIL_OWNER_ADDRESS : player;
			await this.setPoints(
				currentOwner,
				oldLife,
				oldStake,
				oldEffectiveDelta,
				newOwner,
				currentState.life,
				currentState.stake,
				this._effectiveDelta(currentState.delta, currentState.enemyMap),
			);
			await this.setOwner(move.position, newOwner);
		}

		await this.putCell(move.position, currentState);
	}

	/** The contract's `_setPoints`: an owner holds `stake` points exactly while the cell is alive and producing. */
	async setPoints(
		oldOwner: `0x${string}`,
		oldLife: number,
		oldStake: number,
		oldEffectiveDelta: number,
		newOwner: `0x${string}`,
		newLife: number,
		newStake: number,
		newEffectiveDelta: number,
	): Promise<void> {
		const oldHolding = oldOwner != zeroAddress && oldLife > 0 && oldEffectiveDelta > 0 ? oldStake : 0;
		const newHolding = newOwner != zeroAddress && newLife > 0 && newEffectiveDelta > 0 ? newStake : 0;
		if (oldOwner.toLowerCase() == newOwner.toLowerCase()) {
			if (newHolding > oldHolding) await this.addPoints(newOwner, newHolding - oldHolding);
			else if (oldHolding > newHolding) await this.removePoints(oldOwner, oldHolding - newHolding);
		} else {
			if (oldHolding != 0) await this.removePoints(oldOwner, oldHolding);
			if (newHolding != 0) await this.addPoints(newOwner, newHolding);
		}
	}

	async forceSimpleCells(cycle: number, cells: readonly ContractSimpleCell[]): Promise<void> {
		for (const simpleCell of cells) {
			const {delta, enemyMap} = await this.updateNeighbosrDelta(simpleCell.position, simpleCell.color, cycle);

			await this.putCell(simpleCell.position, {
				lastCycleUpdate: cycle,
				cycleWhenTokenIsAdded: cycle,
				color: simpleCell.color,
				life: simpleCell.life,
				delta: delta,
				enemyMap: enemyMap,
				distribution: 0,
				stake: simpleCell.stake,
				producingCycles: 0, // THIS IS FALSE but we go with it
			});
			await this.setOwner(simpleCell.position, simpleCell.owner);
		}

		for (const simpleCell of cells) {
			const cell = await this.getCellInMemory(simpleCell.position);

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

			await this.putCell(simpleCell.position, newCell);
		}
	}

	async updateNeighbosrDelta(center: bigint, color: Color, cycle: number): Promise<{delta: number; enemyMap: number}> {
		const {x, y} = bigIntIDToXY(center);
		const data = {delta: 0, enemyMap: 0};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const cell = await this.getCellInMemory(upPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 1;
				}
				data.delta += enemyOrFriend;
				await this.updateCellFromNeighbor(upPosition, cell, cell.life, cycle, 2, Color.None, color);
			}
		}
		{
			const leftPosition = xyToBigIntID(x - 1, y);
			const cell = await this.getCellInMemory(leftPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 2;
				}
				data.delta += enemyOrFriend;
				await this.updateCellFromNeighbor(leftPosition, cell, cell.life, cycle, 3, Color.None, color);
			}
		}

		{
			const downPosition = xyToBigIntID(x, y + 1);
			const cell = await this.getCellInMemory(downPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 4;
				}
				data.delta += enemyOrFriend;
				await this.updateCellFromNeighbor(downPosition, cell, cell.life, cycle, 0, Color.None, color);
			}
		}
		{
			const rightPosition = xyToBigIntID(x + 1, y);
			const cell = await this.getCellInMemory(rightPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 8;
				}
				data.delta += enemyOrFriend;
				await this.updateCellFromNeighbor(rightPosition, cell, cell.life, cycle, 1, Color.None, color);
			}
		}
		return data;
	}

	async poke(position: bigint, cycle: number): Promise<void> {
		const {updatedCell: currentState, justDied} = await this.getUpdatedCell(position, cycle);

		let distribution = currentState.distribution;
		if (justDied) {
			// its lastCycleUpdate stays the cycle (alpha1 zeroed it here: see the contract's _poke)
			distribution = (currentState.enemyMap << 4) + countBits(currentState.enemyMap);
		}

		await this.updateNeighbours(position, cycle, currentState.color, currentState.color, distribution);

		currentState.distribution = 0;
		await this.putCell(position, currentState);
	}

	isEnemyOrFriend(a: Color, b: Color) {
		if (a != Color.None && b != Color.None) {
			return a == b ? 1 : -1;
		}
		return 0;
	}
}

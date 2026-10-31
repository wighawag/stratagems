import {describe, expect, it} from 'vitest';
import {cellAtCycle, Color, type ContractCell} from 'stratagems-common';
import {contractCellAtCycle, SIMULATION_MAX_LIFE} from './simulation';

/**
 * THE ONE RULE LEFT IN TYPESCRIPT, HELD TO THE CONTRACT'S CODE: the projection
 * of a stored cell to a cycle (`stratagems-common`'s `cellAtCycle`, which the
 * board, the planner, the leaderboard and the winnings run on every cell),
 * against `StratagemsSimulation.cellAtCycle` (the contract's `_getUpdatedCell`)
 * run from its bytecode in the sandbox: every life, both signs of delta, an
 * empty, a partial and a full enemy map, and cycle gaps 0 to 10, from a cell
 * written at cycle 5 and from one never written.
 */

const LIVES = [0, 1, 2, 3, 4, 5, 6, 7];
const DELTAS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const ENEMY_MAPS = [0, 0b0101, 0b1111];
const GAPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function cases(): {cell: ContractCell; cycle: number}[] {
	const all: {cell: ContractCell; cycle: number}[] = [];
	for (const life of LIVES)
		for (const delta of DELTAS)
			for (const enemyMap of ENEMY_MAPS)
				for (const gap of GAPS) {
					all.push({
						cell: {
							lastCycleUpdate: 5,
							cycleWhenTokenIsAdded: 4,
							producingCycles: 3,
							color: Color.Blue,
							life,
							delta,
							enemyMap,
							distribution: 0,
							stake: 1,
						},
						cycle: 5 + gap,
					});
				}
	// never written, or removed: its last update is zero, and nothing moves
	for (const gap of GAPS) {
		all.push({
			cell: {
				lastCycleUpdate: 0,
				cycleWhenTokenIsAdded: 4,
				producingCycles: 3,
				color: Color.None,
				life: 0,
				delta: 0,
				enemyMap: 0,
				distribution: 0,
				stake: 0,
			},
			cycle: 5 + gap,
		});
	}
	return all;
}

describe('the projection, against the contract', () => {
	it('brings every cell to every cycle as `_getUpdatedCell` does', async () => {
		const all = cases();
		const mismatches: string[] = [];
		for (let i = 0; i < all.length; i += 64) {
			const batch = all.slice(i, i + 64);
			const fromContract = await Promise.all(
				batch.map(({cell, cycle}) => contractCellAtCycle(cell, cycle)),
			);
			batch.forEach(({cell, cycle}, k) => {
				const mine = cellAtCycle(cell, cycle, SIMULATION_MAX_LIFE);
				const theirs = fromContract[k];
				if (
					JSON.stringify(mine) !==
					JSON.stringify({cell: theirs.cell, justDied: theirs.justDied})
				) {
					mismatches.push(
						`${JSON.stringify({cell, cycle})}: ${JSON.stringify(mine)} vs ${JSON.stringify(theirs)}`,
					);
				}
			});
		}
		expect(all.length).toBe(
			LIVES.length * DELTAS.length * ENEMY_MAPS.length * GAPS.length +
				GAPS.length,
		);
		expect(mismatches.slice(0, 5)).toEqual([]);
	}, 60_000);

	it('reads an absent cell as the empty one, as the contract reads storage', () => {
		expect(cellAtCycle(undefined, 9, SIMULATION_MAX_LIFE)).toEqual({
			cell: {
				lastCycleUpdate: 0,
				cycleWhenTokenIsAdded: 0,
				producingCycles: 0,
				color: Color.None,
				life: 0,
				delta: 0,
				enemyMap: 0,
				distribution: 0,
				stake: 0,
			},
			justDied: false,
		});
	});
});

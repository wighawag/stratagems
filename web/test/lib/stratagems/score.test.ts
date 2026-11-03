/**
 * A TABLE'S SCORE, the client half (step L4, L4-18): what the board still holds
 * is valued as the end will value it, by the contract's own simulation, so the
 * live ranking is the final one the moment the table ends. Held to the
 * simulation here: a board played by the contract (`./board.ts`), its value at
 * the end compared with what poking it there pays.
 */
import {describe, expect, it} from 'vitest';
import {Color} from 'stratagems-common';
import {
	netGemsOf,
	rankScores,
	settleBatches,
	unsettledPositions,
	valueAtEnd,
} from '$lib/stratagems/score';
import type {BoardState} from '$lib/stratagems/board/indexed-board';
import {
	ALICE,
	at,
	BOB,
	boardAfter,
	CAROL,
	emptyBoardData,
	GEM,
	MAX_LIFE,
} from './board';
import {pokeCells} from './simulation';

const lower = (a: string) => a.toLowerCase();

describe("the board's value at the end", () => {
	it('pays every death to its killers, and every survivor its own gem back', async () => {
		// Alice's Blue at (1,1) has three Red neighbours of Bob's, each of which
		// has her as its one enemy: all four die together, Alice's gem to Bob in
		// three shares and each Red's to Alice; Carol's lone Green survives
		const board = await boardAfter(
			[
				{
					cycle: 10,
					moves: [
						{player: ALICE, x: 1, y: 1, color: Color.Blue},
						{player: BOB, x: 0, y: 1, color: Color.Red},
						{player: BOB, x: 2, y: 1, color: Color.Red},
						{player: BOB, x: 1, y: 0, color: Color.Red},
						{player: CAROL, x: 5, y: 5, color: Color.Green},
					],
				},
			],
			11,
		);
		const value = await valueAtEnd({
			data: board.data,
			cycleNumber: 11,
			maxLife: MAX_LIFE,
			numTokensPerGems: GEM,
			simulate: pokeCells,
		});
		expect(value.get(lower(ALICE))).toBe(3n * GEM);
		expect(value.get(lower(BOB))).toBe(3n * (GEM / 3n));
		expect(value.get(lower(CAROL))).toBe(GEM);
	});

	it('is what poking every coloured cell MAX_LIFE cycles on pays, plus the survivors', async () => {
		const board = await boardAfter(
			[
				{
					cycle: 20,
					moves: [
						{player: ALICE, x: 0, y: 0, color: Color.Blue},
						{player: BOB, x: 1, y: 0, color: Color.Red},
						{player: ALICE, x: 3, y: 3, color: Color.Blue},
					],
				},
				{cycle: 22, moves: [{player: BOB, x: 0, y: 1, color: Color.Red}]},
			],
			24,
		);
		const positions = unsettledPositions(board.data);
		expect(positions.length).toBe(4);
		const value = await valueAtEnd({
			data: board.data,
			cycleNumber: 24,
			maxLife: MAX_LIFE,
			numTokensPerGems: GEM,
			simulate: pokeCells,
		});
		const total = [...value.values()].reduce((a, b) => a + b, 0n);
		// every gem on the board ends somewhere: in a killer's or a survivor's hands
		expect(total).toBe(4n * GEM);
	});

	it('is nothing on an empty or settled board', async () => {
		const board = await boardAfter([{cycle: 5, moves: []}], 6);
		expect(
			(
				await valueAtEnd({
					data: board.data,
					cycleNumber: 6,
					maxLife: MAX_LIFE,
					numTokensPerGems: GEM,
					simulate: pokeCells,
				})
			).size,
		).toBe(0);
		// a settled cell keeps its colour and holds no stake
		const settled = await boardAfter(
			[{cycle: 5, moves: [{player: ALICE, x: 0, y: 0, color: Color.Blue}]}],
			6,
		);
		for (const key of Object.keys(settled.data.cells))
			settled.data.cells[key].stake = 0;
		expect(unsettledPositions(settled.data)).toEqual([]);
	});
});

describe('net gems and the ranking', () => {
	it('is the reserve less the stake, plus collisions and what the board holds for you', () => {
		expect(
			netGemsOf({reserve: 7n, stake: 10n, collisionCredit: 1n, valueAtEnd: 4n}),
		).toBe(2n);
	});

	it('ranks best first, a tie by address, and marks the winners', () => {
		const rows = rankScores(
			[
				{player: BOB, score: 1n},
				{player: ALICE, score: 3n},
				{player: CAROL, score: 3n},
			],
			[ALICE, CAROL],
		);
		expect(rows.map((r) => [r.player, r.winner])).toEqual([
			[lower(ALICE), true],
			[lower(CAROL), true],
			[lower(BOB), false],
		]);
	});

	it('settles in batches of the size given', () => {
		const positions = [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)];
		expect(settleBatches(positions, 2)).toEqual([
			[at(0, 0), at(1, 0)],
			[at(2, 0), at(3, 0)],
			[at(4, 0)],
		]);
		expect(settleBatches([], 2)).toEqual([]);
	});
});

describe('the value at the end, in batches (step L4, G2)', () => {
	/** Pairs of enemies side by side, each the other's one enemy: every one dies, paying the other. */
	function pairs(n: number): BoardState['data'] {
		const data = emptyBoardData();
		const owners = [ALICE, BOB, CAROL];
		const cell = (enemyMap: number, color: number) => ({
			lastCycleUpdate: 100,
			cycleWhenTokenIsAdded: 100,
			producingCycles: 0,
			color,
			life: 2,
			delta: -1,
			enemyMap,
			distribution: 0,
			stake: 1,
		});
		for (let k = 0; k < n / 2; k++) {
			const x = (k % 15) * 3;
			const y = Math.floor(k / 15) * 2;
			data.cells[at(x, y).toString()] = cell(8, 1);
			data.owners[at(x, y).toString()] = lower(owners[k % 3]) as `0x${string}`;
			data.cells[at(x + 1, y).toString()] = cell(2, 2);
			data.owners[at(x + 1, y).toString()] = lower(
				owners[(k + 1) % 3],
			) as `0x${string}`;
		}
		return data;
	}

	it('is the same in batches as in one call, even where a batch splits a pair', async () => {
		// a played board with neighbours across batches, and pairs split by an odd batch
		const played = await boardAfter(
			[
				{
					cycle: 10,
					moves: [
						{player: ALICE, x: 1, y: 1, color: Color.Blue},
						{player: BOB, x: 0, y: 1, color: Color.Red},
						{player: BOB, x: 2, y: 1, color: Color.Red},
						{player: BOB, x: 1, y: 0, color: Color.Red},
						{player: CAROL, x: 1, y: 2, color: Color.Green},
					],
				},
			],
			11,
		);
		for (const data of [played.data, pairs(60)]) {
			const one = await valueAtEnd({
				data,
				cycleNumber: 100,
				maxLife: MAX_LIFE,
				numTokensPerGems: GEM,
				simulate: pokeCells,
				batch: 1000,
			});
			for (const batch of [1, 3, 7]) {
				const batched = await valueAtEnd({
					data,
					cycleNumber: 100,
					maxLife: MAX_LIFE,
					numTokensPerGems: GEM,
					simulate: pokeCells,
					batch,
				});
				expect(batched, `batches of ${batch}`).toEqual(one);
			}
		}
	});

	it('values 300 cells, which one call cannot', async () => {
		const value = await valueAtEnd({
			data: pairs(300),
			cycleNumber: 100,
			maxLife: MAX_LIFE,
			numTokensPerGems: GEM,
			simulate: pokeCells,
		});
		// every gem of the 300 is paid to the other of its pair
		expect([...value.values()].reduce((a, b) => a + b, 0n)).toBe(300n * GEM);
	}, 60_000);
});

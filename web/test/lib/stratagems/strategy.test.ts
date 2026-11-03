/**
 * STRATAGEMS' GREEDY SEAT (step A2 of work/plans/join-template-commit-reveal.md),
 * held to the contract's own code: the boards are played by
 * `StratagemsSimulation` (`./board.ts`) and every score is its answer.
 */
import {describe, expect, it} from 'vitest';
import {zeroAddress} from 'viem';
import {Color, bigIntIDToXY, xyToBigIntID} from 'stratagems-common';
import {seededRandom} from '$lib/game/core/strategy';
import {valueAtEnd} from '$lib/stratagems/score';
import type {BoardState} from '$lib/stratagems/board/indexed-board';
import type {StoredCell} from '$lib/stratagems/preview';
import {
	candidateCells,
	createStratagemsStrategy,
	netGemsOfMove,
	positionsToRead,
	type StoredBoard,
} from '$lib/stratagems/strategy';
import {
	ALICE,
	at,
	BOB,
	boardAfter,
	CAROL,
	GEM,
	MAX_LIFE,
	type Played,
} from './board';
import {pokeCells, simulator} from './simulation';

const NO_START = {owner: zeroAddress, cycle: 0, life: 0} as const;
const lower = (a: string) => a.toLowerCase();

function random(identity: bigint, cycleNumber = 20) {
	return seededRandom({
		chainId: 31337,
		contract: zeroAddress,
		identity,
		cycleNumber,
	});
}

/** A board's data as a strategy holds it. */
function storedBoardOf(data: BoardState['data']): StoredBoard {
	const board = new Map<string, StoredCell>();
	for (const [key, cell] of Object.entries(data.cells)) {
		board.set(key, {
			position: BigInt(key),
			owner: (data.owners[key] ?? zeroAddress) as `0x${string}`,
			cell: {...cell},
			start: NO_START,
		});
	}
	return board;
}

function dataOf(board: StoredBoard): BoardState['data'] {
	const data = {cells: {}, owners: {}} as unknown as BoardState['data'];
	for (const [key, stored] of board) {
		data.cells[key] = {...stored.cell};
		if (stored.owner !== zeroAddress)
			data.owners[key] = lower(stored.owner) as `0x${string}`;
	}
	return data;
}

/** Seeded histories of three seats placing one cell each a cycle in the 13 by 13 block. */
async function playedBoard(seed: number, cycles = 10): Promise<BoardState> {
	let s = seed;
	const next = () => {
		s = (s * 1103515245 + 12345) % 2147483648;
		return s / 2147483648;
	};
	const players = [
		[ALICE, Color.Blue],
		[BOB, Color.Red],
		[CAROL, Color.Green],
	] as const;
	const used = new Set<string>();
	const history: {cycle: number; moves: Played[]}[] = [];
	for (let c = 0; c < cycles; c++) {
		const moves: Played[] = [];
		for (const [player, color] of players) {
			let x: number, y: number;
			do {
				x = Math.floor(next() * 13) - 6;
				y = Math.floor(next() * 13) - 6;
			} while (used.has(`${x},${y}`));
			used.add(`${x},${y}`);
			moves.push({player, x, y, color});
		}
		history.push({cycle: 10 + c, moves});
	}
	return boardAfter(history, 10 + cycles);
}

/** The same score over the WHOLE board, by `valueAtEnd`: what the neighbourhood is held to. */
async function wholeBoardNetGems(
	board: StoredBoard,
	player: `0x${string}`,
	cycleNumber: number,
	position: bigint,
) {
	const value = async (b: StoredBoard) =>
		(
			await valueAtEnd({
				data: dataOf(b),
				cycleNumber,
				maxLife: MAX_LIFE,
				numTokensPerGems: GEM,
				simulate: pokeCells,
			})
		).get(lower(player)) ?? 0n;
	const {x, y} = bigIntIDToXY(position);
	const read = [
		[0, 0],
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	]
		.map(([dx, dy]) => board.get(xyToBigIntID(x + dx, y + dy).toString()))
		.filter((c): c is StoredCell => c !== undefined);
	const revealed = await simulator.resolveMoves(read, player, cycleNumber, [
		{position, color: Color.Blue},
	]);
	const after = new Map(board);
	for (const cell of revealed.cells) after.set(cell.position.toString(), cell);
	const paid = revealed.payouts
		.filter((p) => lower(p.to) === lower(player))
		.reduce((a, p) => a + p.amount, 0n);
	return paid + (await value(after)) - (await value(board)) - revealed.cost;
}

describe('greedy scores a move on its neighbourhood (A2-5)', () => {
	it('exactly as on the whole board, on played boards', async () => {
		let compared = 0;
		let nonZero = 0;
		for (const seed of [7, 11, 13]) {
			const played = await playedBoard(seed);
			const board = storedBoardOf(played.data);
			const candidates = candidateCells({
				board,
				random: random(BigInt(seed)),
				cap: 15,
			});
			for (const position of candidates) {
				const local = await netGemsOfMove({
					board,
					player: ALICE,
					cycleNumber: played.cycleNumber,
					move: {position, color: Color.Blue},
					maxLife: MAX_LIFE,
					numTokensPerGems: GEM,
					simulator,
				});
				const whole = await wholeBoardNetGems(
					board,
					ALICE,
					played.cycleNumber,
					position,
				);
				expect(
					local,
					`seed ${seed}, ${bigIntIDToXY(position).x},${bigIntIDToXY(position).y}`,
				).toBe(whole);
				compared++;
				if (local !== 0n) nonZero++;
			}
		}
		expect(compared).toBe(45);
		// the comparison must have something to compare
		expect(nonZero).toBeGreaterThan(5);
	}, 120_000);
});

describe('the candidates (A2-4)', () => {
	it('are empty cells of the block touching a coloured cell, and one touching none last', async () => {
		const played = await playedBoard(7);
		const board = storedBoardOf(played.data);
		const cells = candidateCells({board, random: random(1n), cap: 12});
		expect(cells).toHaveLength(12);
		expect(new Set(cells.map(String)).size).toBe(12);
		const touches = (p: bigint) => {
			const {x, y} = bigIntIDToXY(p);
			return [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			].some(
				([dx, dy]) =>
					(board.get(xyToBigIntID(x + dx, y + dy).toString())?.cell.color ??
						0) !== 0,
			);
		};
		for (const p of cells) {
			const {x, y} = bigIntIDToXY(p);
			expect(Math.abs(x) <= 6 && Math.abs(y) <= 6).toBe(true);
			expect(board.get(p.toString())?.cell.color ?? 0).toBe(0);
		}
		expect(cells.slice(0, 11).every(touches)).toBe(true);
		expect(touches(cells[11])).toBe(false);
	}, 60_000);

	it('are the same for the same seat and cycle, and differ for another seat', async () => {
		const board = storedBoardOf((await playedBoard(11)).data);
		const a = candidateCells({board, random: random(1n)});
		expect(candidateCells({board, random: random(1n)})).toEqual(a);
		expect(candidateCells({board, random: random(2n)})).not.toEqual(a);
	}, 60_000);

	it('on an empty board, are one cell, played without a simulation', async () => {
		let calls = 0;
		const counting = {
			resolveMoves: (...args: Parameters<typeof simulator.resolveMoves>) => (
				calls++,
				simulator.resolveMoves(...args)
			),
			poke: (...args: Parameters<typeof simulator.poke>) => (
				calls++,
				simulator.poke(...args)
			),
		};
		const strategy = createStratagemsStrategy({
			readBoard: async (positions) =>
				positions.map((position) => ({
					position,
					owner: zeroAddress,
					cell: {
						lastCycleUpdate: 0,
						cycleWhenTokenIsAdded: 0,
						producingCycles: 0,
						color: 0,
						life: 0,
						delta: 0,
						enemyMap: 0,
						distribution: 0,
						stake: 0,
					},
					start: NO_START,
				})),
			simulator: counting,
			config: {maxLife: MAX_LIFE, numTokensPerGems: GEM},
			colorOf: () => Color.Blue,
		});
		const turn = await strategy({
			identity: BigInt(ALICE),
			cycleNumber: 20,
			level: 'greedy',
			random: random(1n),
			budget: {actionsAtMost: 1},
		});
		expect(turn).toHaveLength(1);
		expect(turn[0].color).toBe(Color.Blue);
		expect(calls).toBe(0);
	});
});

describe('a greedy decision', () => {
	function strategyOn(
		board: StoredBoard,
		onDecided?: (m: {ms: number; candidates: number}) => void,
		cap?: number,
	) {
		return createStratagemsStrategy({
			readBoard: async (positions) =>
				positions.map(
					(position) =>
						board.get(position.toString()) ?? {
							position,
							owner: zeroAddress,
							cell: {
								lastCycleUpdate: 0,
								cycleWhenTokenIsAdded: 0,
								producingCycles: 0,
								color: 0,
								life: 0,
								delta: 0,
								enemyMap: 0,
								distribution: 0,
								stake: 0,
							},
							start: NO_START,
						},
				),
			simulator,
			config: {maxLife: MAX_LIFE, numTokensPerGems: GEM},
			colorOf: () => Color.Blue,
			cap,
			onDecided,
		});
	}

	it('takes the best of its candidates, which beats what the baseline cell is worth', async () => {
		let strictlyBetter = 0;
		for (const seed of [7, 11, 13]) {
			const played = await playedBoard(seed);
			const board = storedBoardOf(played.data);
			const input = {
				identity: BigInt(ALICE),
				cycleNumber: played.cycleNumber,
				level: 'greedy',
				budget: {actionsAtMost: 1},
			};
			const [chosen] = await strategyOn(board)({
				...input,
				random: random(BigInt(seed), played.cycleNumber),
			});
			const candidates = candidateCells({
				board,
				random: random(BigInt(seed), played.cycleNumber),
			});
			const scores = await Promise.all(
				candidates.map((position) =>
					netGemsOfMove({
						board,
						player: ALICE,
						cycleNumber: played.cycleNumber,
						move: {position, color: Color.Blue},
						maxLife: MAX_LIFE,
						numTokensPerGems: GEM,
						simulator,
					}),
				),
			);
			const best = scores.reduce((a, b) => (b > a ? b : a));
			expect(scores[candidates.indexOf(chosen.position)]).toBe(best);
			// the lone cell, last, survives alone: net zero
			expect(scores[scores.length - 1]).toBe(0n);
			if (best > 0n) strictlyBetter++;
		}
		expect(strictlyBetter).toBeGreaterThan(0);
	}, 120_000);

	it('on a fixed board, takes the cell worth most: beside three enemy cells rather than one', async () => {
		// Bob at (0,0), (1,1), (-1,1) and (0,2): (0,1) touches all four's ring of
		// three, the cells around them touch one each. Measured with the contract:
		// +3 gems at (0,1), +1 beside a single red cell, 0 anywhere else.
		const played = await boardAfter(
			[
				{
					cycle: 10,
					moves: [
						{player: BOB, x: 0, y: 0, color: Color.Red},
						{player: BOB, x: 1, y: 1, color: Color.Red},
						{player: BOB, x: -1, y: 1, color: Color.Red},
						{player: BOB, x: 0, y: 2, color: Color.Red},
					],
				},
			],
			11,
		);
		const board = storedBoardOf(played.data);
		const score = (x: number, y: number) =>
			netGemsOfMove({
				board,
				player: ALICE,
				cycleNumber: 11,
				move: {position: at(x, y), color: Color.Blue},
				maxLife: MAX_LIFE,
				numTokensPerGems: GEM,
				simulator,
			});
		expect(await score(0, 1)).toBe(3n * GEM);
		expect(await score(1, 0)).toBe(GEM);
		expect(await score(5, 5)).toBe(0n);
		for (const seat of [1n, 2n, 3n]) {
			const [chosen] = await strategyOn(
				board,
				undefined,
				50,
			)({
				identity: BigInt(ALICE),
				cycleNumber: 11,
				level: 'greedy',
				random: random(seat, 11),
				budget: {actionsAtMost: 1},
			});
			expect(chosen).toEqual({position: at(0, 1), color: Color.Blue});
		}
	}, 60_000);

	it('is timed on a board of 30 moves (A2-8)', async () => {
		const played = await playedBoard(7);
		const board = storedBoardOf(played.data);
		const measures: {ms: number; candidates: number}[] = [];
		const strategy = strategyOn(board, (m) => measures.push(m));
		for (let i = 0; i < 5; i++) {
			await strategy({
				identity: BigInt(ALICE),
				cycleNumber: played.cycleNumber,
				level: 'greedy',
				random: random(BigInt(i), played.cycleNumber),
				budget: {actionsAtMost: 1},
			});
		}
		const ms = measures.map((m) => m.ms).sort((a, b) => a - b);
		process.stderr.write(
			`greedy on 30 moves: ${measures[0].candidates} candidates, decisions ${ms.join(', ')} ms\n`,
		);
		expect(measures.every((m) => m.candidates === 12)).toBe(true);
		expect(ms[2]).toBeLessThan(500);
	}, 60_000);

	it('reads the block widened by 2', () => {
		expect(positionsToRead()).toHaveLength(17 * 17);
	});
});

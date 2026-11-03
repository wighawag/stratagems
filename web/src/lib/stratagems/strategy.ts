/**
 * STRATAGEMS' STRATEGY: how a world seat at the `greedy` level picks its move,
 * scored by the game's own resolution run from its bytecode (step A2 of
 * work/plans/join-template-commit-reveal.md, A2-3 to A2-8).
 *
 * THE OBJECTIVE IS NET GEMS (L4-4, PA5): what the move earns the seat, less
 * what it costs, with the board projected to the end as the table's score
 * projects it (`score.ts`): every cell poked `MAX_LIFE` cycles on with nobody
 * moving, the dead paying their killers and the living their own stake back.
 * A cell the projection shows dying counts for nothing, so a gem placed where
 * it will die is a gem lost, and a placement that kills is worth the share.
 *
 * ON THE MOVE'S NEIGHBOURHOOD, AND THAT IS EXACT (A2-5): a cell's life over the
 * cycles reads only its neighbours' colours (a dead cell keeps its colour, so a
 * death changes no neighbour), and a move changes one cell's colour. So the
 * move changes the end of its own cell and its four neighbours only, every
 * payout from those goes to one of their neighbours, and their futures read
 * only cells within distance 2, which the move leaves alone. Valuing those
 * five cells before and after is the whole board's difference for a tenth of
 * the work (measured 2026-11-03 on 30 moves: 10 ms against 160), and
 * `strategy.test.ts` holds it to the whole board's on played boards.
 *
 * THE RULES ARE THE CONTRACT'S (PA4): `resolveMoves` and `poke` of
 * `StratagemsSimulation`, handed the cells AS STORED (`getStoredCells`, A2-6:
 * `getCells` answers each cell brought to the current cycle, which forgets a
 * death nobody has poked yet, so its killers would never be paid).
 *
 * ONE MOVE, in the seat's default colour, as `random` plays (A2-3), so both
 * levels spend a gem a cycle and a comparison between them is about where.
 * The candidates (A2-4) are the empty cells of the block a played turn lands in
 * that touch a coloured cell, and one empty cell touching none (it survives
 * alone: net zero, the floor), drawn in the seat's seeded order and capped
 * ({@link GREEDY_CANDIDATES}, A2-8). Ties go to the seeded order's first.
 *
 * WHAT IT SEES (PA6): the board on chain, through `readBoard`, and the
 * simulation. Nothing of the page.
 */
import {bigIntIDToXY, xyToBigIntID} from 'stratagems-common';
import type {AiLevel, SeededRandom, Strategy} from '$lib/game/core/strategy';
import type {Move} from './moves';
import type {StoredCell} from './preview';

/** The levels stratagems' world seats may play at. `random` is today's. */
export const STRATAGEMS_LEVELS: readonly AiLevel[] = [
	{id: 'random', label: 'Random'},
	{id: 'greedy', label: 'Greedy'},
];

/**
 * HOW MANY MOVES A DECISION SIMULATES, at most (A2-8): about 25 ms each in node
 * (one resolution and two valuations of a neighbourhood), so a decision stays
 * near 300 ms there and under the 500 ms A1-11 allows a round in the browser.
 */
export const GREEDY_CANDIDATES = 12;

/** How far from the origin a played move may land, on each axis (the offline world's 13 by 13 block). */
export const PLAYED_TURN_SPREAD = 13;

/** What `StratagemsSimulation.resolveMoves` and `poke` answer. */
export type SimulationOutcome = {
	cells: readonly StoredCell[];
	payouts: readonly {to: `0x${string}`; amount: bigint}[];
	cost: bigint;
};

/** The two calls the strategy makes of the simulation. */
export type StratagemsSimulator = {
	resolveMoves(
		board: readonly StoredCell[],
		player: `0x${string}`,
		cycle: number,
		moves: readonly Move[],
	): Promise<SimulationOutcome>;
	poke(
		board: readonly StoredCell[],
		cycle: number,
		positions: readonly bigint[],
	): Promise<SimulationOutcome>;
};

/** A board as the strategy holds it: every stored cell it read, by position key. */
export type StoredBoard = ReadonlyMap<string, StoredCell>;

const NEIGHBOURS: readonly (readonly [number, number])[] = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
];

const lower = (a: string) => a.toLowerCase();

function coloured(cell: StoredCell | undefined): boolean {
	return cell !== undefined && cell.cell.color !== 0;
}

/** Every position within Manhattan distance `d` of `centre`, itself first. */
export function within(centre: bigint, d: number): bigint[] {
	const {x, y} = bigIntIDToXY(centre);
	const out: bigint[] = [];
	for (let dy = -d; dy <= d; dy++) {
		for (let dx = -d; dx <= d; dx++) {
			if (Math.abs(dx) + Math.abs(dy) > d) continue;
			out.push(xyToBigIntID(x + dx, y + dy));
		}
	}
	return out.sort((a, b) =>
		a === centre ? -1 : b === centre ? 1 : a < b ? -1 : a > b ? 1 : 0,
	);
}

/** The positions the strategy reads: the block, widened by 2 so every candidate's neighbourhood is in it. */
export function positionsToRead(spread = PLAYED_TURN_SPREAD): bigint[] {
	const half = Math.floor(spread / 2) + 2;
	const ids: bigint[] = [];
	for (let y = -half; y <= half; y++) {
		for (let x = -half; x <= half; x++) ids.push(xyToBigIntID(x, y));
	}
	return ids;
}

/**
 * THE CELLS GREEDY TRIES (A2-4), in the seat's seeded order: empty cells of the
 * block touching a coloured cell, at most `cap - 1` of them, then one empty cell
 * touching none (when there is one), or more frontier cells in its place.
 */
export function candidateCells(params: {
	board: StoredBoard;
	random: SeededRandom;
	cap?: number;
	spread?: number;
}): bigint[] {
	const cap = params.cap ?? GREEDY_CANDIDATES;
	const half = Math.floor((params.spread ?? PLAYED_TURN_SPREAD) / 2);
	const frontier: bigint[] = [];
	const alone: bigint[] = [];
	for (let y = -half; y <= half; y++) {
		for (let x = -half; x <= half; x++) {
			const position = xyToBigIntID(x, y);
			if (coloured(params.board.get(position.toString()))) continue;
			const touches = NEIGHBOURS.some(([dx, dy]) =>
				coloured(params.board.get(xyToBigIntID(x + dx, y + dy).toString())),
			);
			(touches ? frontier : alone).push(position);
		}
	}
	const drawn = (from: bigint[], n: number) => {
		const pool = [...from];
		const out: bigint[] = [];
		while (out.length < n && pool.length > 0) {
			out.push(pool.splice(params.random.below(pool.length), 1)[0]);
		}
		return out;
	};
	const baseline = alone.length > 0 ? drawn(alone, 1) : [];
	return [...drawn(frontier, cap - baseline.length), ...baseline];
}

/**
 * What the board, as left after a move at `centre`, will pay `player` from the
 * cells within distance 1 of it: their payouts and their survivors' stake, at
 * `cycle` (the end). Only those cells' ends can differ between before and after.
 */
async function neighbourhoodValue(params: {
	board: StoredBoard;
	centre: bigint;
	player: `0x${string}`;
	cycle: number;
	numTokensPerGems: bigint;
	simulator: StratagemsSimulator;
}): Promise<bigint> {
	const player = lower(params.player);
	const near = within(params.centre, 1).filter((position) => {
		const cell = params.board.get(position.toString());
		return coloured(cell) && cell!.cell.stake !== 0;
	});
	if (near.length === 0) return 0n;
	const context = within(params.centre, 2)
		.map((position) => params.board.get(position.toString()))
		.filter((cell): cell is StoredCell => cell !== undefined);
	const outcome = await params.simulator.poke(context, params.cycle, near);
	let value = 0n;
	for (const payout of outcome.payouts) {
		if (lower(payout.to) === player) value += payout.amount;
	}
	const isNear = new Set(near.map((p) => p.toString()));
	for (const stored of outcome.cells) {
		if (!isNear.has(stored.position.toString())) continue;
		if (stored.cell.color === 0 || stored.cell.life === 0) continue;
		if (lower(stored.owner) !== player) continue;
		value += BigInt(stored.cell.stake) * params.numTokensPerGems;
	}
	return value;
}

/** `board` with `cells` written over it. */
function withCells(
	board: StoredBoard,
	cells: readonly StoredCell[],
): StoredBoard {
	const next = new Map(board);
	for (const stored of cells) next.set(stored.position.toString(), stored);
	return next;
}

/**
 * THE SEAT'S NET GEMS FROM ONE MOVE (A2-5): what its reveal pays the seat, plus
 * what the neighbourhood will pay it at the end after the move, less the same
 * without the move, less the gems the move places.
 */
export async function netGemsOfMove(params: {
	board: StoredBoard;
	player: `0x${string}`;
	cycleNumber: number;
	move: Move;
	maxLife: number;
	numTokensPerGems: bigint;
	simulator: StratagemsSimulator;
}): Promise<bigint> {
	const {board, player, cycleNumber, move, simulator} = params;
	const end = cycleNumber + params.maxLife;
	// every cell the resolution reads: the moved cell and its neighbours (`touchedBy`)
	const context = within(move.position, 1)
		.map((position) => board.get(position.toString()))
		.filter((cell): cell is StoredCell => cell !== undefined);
	const revealed = await simulator.resolveMoves(context, player, cycleNumber, [
		move,
	]);
	let paidNow = 0n;
	for (const payout of revealed.payouts) {
		if (lower(payout.to) === lower(player)) paidNow += payout.amount;
	}
	const common = {
		centre: move.position,
		player,
		cycle: end,
		numTokensPerGems: params.numTokensPerGems,
		simulator,
	};
	const before = await neighbourhoodValue({...common, board});
	const after = await neighbourhoodValue({
		...common,
		board: withCells(board, revealed.cells),
	});
	return paidNow + after - before - revealed.cost;
}

/** A measure of one decision, for a caller that records it (the world test, the e2e). */
export type DecisionMeasure = {ms: number; cells: number; candidates: number};

export function createStratagemsStrategy(params: {
	/** The stored cells at `positions` (`getStoredCells` on the game, A2-6). */
	readBoard(positions: readonly bigint[]): Promise<readonly StoredCell[]>;
	simulator: StratagemsSimulator;
	config: {maxLife: number; numTokensPerGems: bigint};
	/** The colour a seat plays: its default faction. */
	colorOf(account: `0x${string}`): number;
	cap?: number;
	onDecided?: (measure: DecisionMeasure) => void;
}): Strategy<Move> {
	return async ({identity, cycleNumber, random, budget}) => {
		if (budget.actionsAtMost < 1) return [];
		const started = Date.now();
		const player =
			`0x${identity.toString(16).padStart(40, '0')}` as `0x${string}`;
		const color = params.colorOf(player);
		const stored = await params.readBoard(positionsToRead());
		const board: StoredBoard = new Map(
			stored
				.filter(
					(cell) => cell.cell.color !== 0 || cell.cell.lastCycleUpdate !== 0,
				)
				.map((cell) => [BigInt(cell.position).toString(), cell]),
		);
		const candidates = candidateCells({board, random, cap: params.cap});
		let best: {position: bigint; score: bigint} | undefined;
		if (candidates.length === 1) {
			best = {position: candidates[0], score: 0n};
		} else {
			for (const position of candidates) {
				const score = await netGemsOfMove({
					board,
					player,
					cycleNumber,
					move: {position, color},
					maxLife: params.config.maxLife,
					numTokensPerGems: params.config.numTokensPerGems,
					simulator: params.simulator,
				});
				if (!best || score > best.score) best = {position, score};
			}
		}
		params.onDecided?.({
			ms: Date.now() - started,
			cells: board.size,
			candidates: candidates.length,
		});
		return best ? [{position: best.position, color}] : [];
	};
}

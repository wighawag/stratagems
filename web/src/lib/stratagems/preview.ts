/**
 * What the planned moves will do, from the contract's own code.
 *
 * stratagems' resolution is storage-heavy, so it is not split into a pure core:
 * it is the sandbox's SECOND pattern (`$lib/game/simulation/README.md`).
 * `StratagemsSimulation` (`contracts/src/game/simulation/`) inherits the
 * reveal's resolution unchanged, seeds storage of its own with the cells it is
 * handed, runs the moves and returns the cells they touched; its deployed code
 * runs in the bytecode sandbox, so nothing here knows what a move does. Until
 * step X2 the view ran `stratagems-common`'s TypeScript copy of the rules.
 *
 * What IS here is the load: every cell the moves can read (each moved cell and
 * its four neighbours) as the indexer holds it, which is the contract's stored
 * record (the indexer folds `CellsWritten`), with no record of the cycle's
 * start. That is the state at the cycle's start while the player can plan: in
 * the commit phase no reveal of the cycle has landed.
 *
 * It is ONE PLAYER'S TURN, and that is all a preview can be: what the others
 * committed this cycle is a hash.
 */
import {derived, type Readable} from 'svelte/store';
import {bigIntIDToXY, xyToBigIntID, type ContractCell} from 'stratagems-common';
import {zeroAddress} from 'viem';
import {latestResult, type LatestResult} from '$lib/game/simulation';
import type {OnchainStateValue} from '$lib/game/core/seams';
import type {BoardState} from './board/indexed-board';
import type {Move} from './moves';
import type {LocalPlan} from './view';

/** The record of the first move on a cell in its cycle (`cycle` 0: none). */
export type CellAtCycleStart = {
	owner: `0x${string}`;
	cycle: number;
	life: number;
};

/** A cell as the contract stores it: `StratagemsSimulation.StoredCell`. */
export type StoredCell = {
	position: bigint;
	owner: `0x${string}`;
	cell: ContractCell;
	start: CellAtCycleStart;
};

/** What a cell will be once the turn is revealed, as stored (bring it to a cycle to draw it). */
export type CellAfter = {cell: ContractCell; owner: `0x${string}`};

/** Every cell the turn touches, by position key. */
export type MovesPreview = ReadonlyMap<string, CellAfter>;

/** `StratagemsSimulation.resolveMoves`, run from its bytecode: the touched cells after the turn. */
export type SimulateMoves = (
	board: readonly StoredCell[],
	player: `0x${string}`,
	cycleNumber: number,
	moves: readonly Move[],
) => Promise<readonly StoredCell[]>;

export type PreviewInput = {
	player: `0x${string}`;
	cycleNumber: number;
	moves: readonly Move[];
	/** The stored cells the moves can read, as they were when asked. */
	board: readonly StoredCell[];
};

export type MovesPreviewStore = Readable<
	LatestResult<PreviewInput, MovesPreview>
>;

const NO_START: CellAtCycleStart = {owner: zeroAddress, cycle: 0, life: 0};

/** Each moved cell and its four neighbours, each once: every cell a resolution reads. */
export function touchedBy(positions: readonly bigint[]): bigint[] {
	const touched: bigint[] = [];
	const seen = new Set<bigint>();
	for (const position of positions) {
		const {x, y} = bigIntIDToXY(position);
		for (const [dx, dy] of [
			[0, 0],
			[0, -1],
			[-1, 0],
			[0, 1],
			[1, 0],
		]) {
			const id = xyToBigIntID(x + dx, y + dy);
			if (!seen.has(id)) {
				seen.add(id);
				touched.push(id);
			}
		}
	}
	return touched;
}

/** The stored cells among `positions` the board holds (an absent one is empty, as in the contract). */
export function storedCellsOf(
	data: BoardState['data'],
	positions: readonly bigint[],
): StoredCell[] {
	const stored: StoredCell[] = [];
	for (const position of positions) {
		const key = position.toString();
		const cell = data.cells[key];
		if (!cell) continue;
		stored.push({
			position,
			owner: data.owners[key] ?? zeroAddress,
			cell: {...cell},
			start: NO_START,
		});
	}
	return stored;
}

export function createMovesPreview(params: {
	plan: Readable<LocalPlan>;
	/** The board as the indexer holds it (not the held copy the view draws). */
	board: Readable<OnchainStateValue<BoardState>>;
	simulate: SimulateMoves;
}): MovesPreviewStore {
	const {plan, board, simulate} = params;

	const inputs = derived(
		[plan, board],
		([$plan, $board]): PreviewInput | undefined => {
			if (!$plan.player || $board.step !== 'Loaded') return undefined;
			if ($plan.planned.length === 0) return undefined;
			return {
				player: $plan.player.toLowerCase() as `0x${string}`,
				cycleNumber: $board.cycleNumber,
				moves: $plan.planned,
				board: storedCellsOf(
					$board.data,
					touchedBy($plan.planned.map((move) => move.position)),
				),
			};
		},
	);

	return latestResult(
		inputs,
		async (input) => {
			const after = await simulate(
				input.board,
				input.player,
				input.cycleNumber,
				input.moves,
			);
			return new Map(
				after.map((stored) => [
					stored.position.toString(),
					{
						cell: {...stored.cell},
						owner: stored.owner.toLowerCase() as `0x${string}`,
					},
				]),
			);
		},
		{equal: sameInput},
	);
}

/** Two lists of the same moves, in the same order. */
export function sameMoves(a: readonly Move[], b: readonly Move[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(move, i) => move.position === b[i].position && move.color === b[i].color,
		)
	);
}

const CELL_FIELDS: readonly (keyof ContractCell)[] = [
	'lastCycleUpdate',
	'cycleWhenTokenIsAdded',
	'producingCycles',
	'color',
	'life',
	'delta',
	'enemyMap',
	'distribution',
	'stake',
];

function sameInput(a: PreviewInput, b: PreviewInput): boolean {
	return (
		a.player === b.player &&
		a.cycleNumber === b.cycleNumber &&
		sameMoves(a.moves, b.moves) &&
		a.board.length === b.board.length &&
		a.board.every((stored, i) => {
			const other = b.board[i];
			return (
				stored.position === other.position &&
				stored.owner === other.owner &&
				CELL_FIELDS.every((field) => stored.cell[field] === other.cell[field])
			);
		})
	);
}

/**
 * The plan with its preview, for the view merge: the preview is attached only
 * when it was computed for exactly the moves planned NOW, so a preview of the
 * plan as it was a click ago is never drawn over the plan as it is.
 */
export function withPreview(
	plan: Readable<LocalPlan>,
	preview: MovesPreviewStore,
): Readable<LocalPlan> {
	return derived([plan, preview], ([$plan, $preview]): LocalPlan => {
		if ($preview.step !== 'Ready') return $plan;
		return sameMoves($preview.input.moves, $plan.planned)
			? {...$plan, preview: $preview.result}
			: $plan;
	});
}

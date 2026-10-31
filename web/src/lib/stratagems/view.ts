/**
 * What the renderer draws: the indexed board, as it stands at the board's cycle,
 * with what the player's planned moves will do drawn over it once the
 * contract's own code has said (`./preview.ts`: `StratagemsSimulation`, run in
 * the bytecode sandbox), collisions and neighbours included. Until it has, the
 * planned moves show as planned (the ghost, the cross) on the board as it is.
 *
 * Every cell is brought to the board's cycle by the projection
 * (`stratagems-common`'s `cellAtCycle`, held to the contract's bytecode by a
 * differential test), the one rule the client runs in TypeScript.
 *
 * A pure function of its inputs (the framework's `ViewMerge`).
 */
import {
	bigIntIDToXY,
	cellAtCycle,
	Color,
	effectiveDelta,
	type ContractCell,
} from 'stratagems-common';
import type {ViewMerge} from '$lib/view';
import type {BoardState} from './board/indexed-board';
import type {Move} from './moves';
import type {MovesPreview} from './preview';

/**
 * Where a cell's life goes at the next cycle, by the contract's rule: a living
 * cell moves by one, up when it has more friends than enemies or no enemy at
 * all, otherwise down; `full` is growing at the maximum, `dead` is life 0 (a
 * dead cell stays on the board, keeps its colour, and keeps counting as a
 * friend or an enemy for its neighbours).
 */
export type Trend = 'grow' | 'shrink' | 'full' | 'dead';

/** One cell as drawn. */
export type CellView = {
	position: bigint;
	x: number;
	y: number;
	/** `Color`: 0 none, 1 to 5 the factions, 6 evil. */
	color: number;
	/** Life at the board's cycle (0 is dead). */
	life: number;
	stake: number;
	/** Where its life goes at the next cycle. */
	trend: Trend;
	/** Same-colour neighbours, dead ones included (the contract counts them). */
	friends: number;
	/** Other-colour neighbours, dead ones included. */
	enemies: number;
	owner: `0x${string}` | undefined;
	/** Owned by the player viewing. */
	mine: boolean;
	/** The colour a planned move puts here, if one does. */
	planned?: number;
	/**
	 * An Evil cell's makers: the players whose placements collided on it, one
	 * gem each, while the indexer still knows them (it keeps who placed where
	 * for the last 7 revealed cycles); undefined otherwise.
	 */
	makers?: `0x${string}`[];
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type BoardView = {
	cells: Map<string, CellView>;
	/** Who is viewing, lower-case, when anyone is. */
	player?: `0x${string}`;
};

/** The plan as the view needs it: the moves, whose they are, and what they will do. */
export type LocalPlan = {
	planned: readonly Move[];
	player?: `0x${string}`;
	/**
	 * The cells the planned moves touch, after the turn, when the sandbox has
	 * answered for exactly these moves (`./preview.ts`, `withPreview`).
	 */
	preview?: MovesPreview;
};

function countBits(map: number): number {
	let count = 0;
	for (let bits = map; bits > 0; bits >>= 1) count += bits & 1;
	return count;
}

/**
 * The trend of a cell already brought to the board's cycle, from the stored
 * `delta` (friends minus enemies) and `enemyMap` (one bit per enemy
 * neighbour), through the projection's `effectiveDelta` (the contract's
 * `_effectiveDelta`): the board can never draw a rule the contract does not apply.
 */
export function trendOf(
	cell: Pick<ContractCell, 'life' | 'delta' | 'enemyMap'>,
	maxLife: number,
): Trend {
	if (cell.life <= 0) return 'dead';
	if (effectiveDelta(cell.delta, cell.enemyMap) < 0) return 'shrink';
	return cell.life >= maxLife ? 'full' : 'grow';
}

/**
 * The players of the latest collision on `key` the placement window still
 * holds (newest first): an Evil cell is made by one, and a move on a living
 * Evil cell is skipped, so the latest is the one that made it.
 */
function makersOf(
	placements: BoardState['data']['placements'],
	key: string,
): `0x${string}`[] | undefined {
	for (const cycle of placements) {
		const players = cycle.cells[key]?.players;
		if (players && players.length > 1) {
			return players.map(
				(player) => player.address.toLowerCase() as `0x${string}`,
			);
		}
	}
	return undefined;
}

/** The merge, for a deployment's `maxLife`. */
export function createBoardMerge(
	maxLife: number,
): ViewMerge<BoardState, LocalPlan, BoardView> {
	return ({onchain, local, cycleNumber}) =>
		mergeBoardView({onchain, local, cycleNumber, maxLife});
}

export function mergeBoardView(params: {
	onchain: BoardState;
	local: LocalPlan;
	cycleNumber: number;
	maxLife: number;
}): BoardView {
	const {onchain, local, cycleNumber} = params;
	const player = local.player?.toLowerCase() as `0x${string}` | undefined;

	const planned = new Map<string, number>();
	if (player) {
		for (const move of local.planned) {
			planned.set(move.position.toString(), move.color);
		}
	}

	// the board, with what the turn will do over it once the contract has said
	const cellsOf: {[key: string]: ContractCell | undefined} = {
		...onchain.data.cells,
	};
	const ownersOf: {[key: string]: `0x${string}` | undefined} = {
		...onchain.data.owners,
	};
	if (player && local.preview) {
		for (const [key, after] of local.preview) {
			// a neighbour nobody ever placed on stays off the board
			if (
				!(key in cellsOf) &&
				after.cell.lastCycleUpdate === 0 &&
				after.cell.color === Color.None
			)
				continue;
			cellsOf[key] = after.cell;
			ownersOf[key] = after.owner;
		}
	}

	const keys = new Set([...Object.keys(cellsOf), ...planned.keys()]);
	const cells = new Map<string, CellView>();
	for (const key of keys) {
		const position = BigInt(key);
		const {x, y} = bigIntIDToXY(position);
		const {cell: updatedCell} = cellAtCycle(
			cellsOf[key],
			cycleNumber,
			params.maxLife,
		);
		const stored = ownersOf[key]?.toLowerCase();
		const owner =
			stored && stored !== ZERO_ADDRESS ? (stored as `0x${string}`) : undefined;
		const enemies = countBits(updatedCell.enemyMap);
		cells.set(key, {
			position,
			x,
			y,
			color: updatedCell.color,
			life: updatedCell.life,
			stake: updatedCell.stake,
			trend: trendOf(updatedCell, params.maxLife),
			friends: updatedCell.delta + enemies,
			enemies,
			owner,
			mine: owner !== undefined && owner === player,
			planned: planned.get(key),
			...(updatedCell.color === Color.Evil
				? {makers: makersOf(onchain.data.placements, key)}
				: {}),
		});
	}
	return {cells, player};
}

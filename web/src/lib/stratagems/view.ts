/**
 * What the renderer draws: the indexed board, as it stands at the board's cycle,
 * with the player's planned moves played onto it by `stratagems-common`'s copy
 * of the contract's rules (`StratagemsContract.computeMove`), so a planned move
 * shows what it would do, collisions and neighbours included.
 *
 * A pure function of its inputs (the framework's `ViewMerge`); the board's data
 * is copied before the simulation writes to it.
 */
import {
	bigIntIDToXY,
	StratagemsContract,
	type ContractCell,
	type StratagemsState,
} from 'stratagems-common';
import type {ViewMerge} from '$lib/view';
import type {BoardState} from './board/indexed-board';
import type {Move} from './moves';

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
	owner: `0x${string}` | undefined;
	/** Owned by the player viewing. */
	mine: boolean;
	/** The colour a planned move puts here, if one does. */
	planned?: number;
};

export type BoardView = {
	cells: Map<string, CellView>;
	/** Who is viewing, lower-case, when anyone is. */
	player?: `0x${string}`;
};

/** The plan as the view needs it: the moves, and whose they are. */
export type LocalPlan = {
	planned: readonly Move[];
	player?: `0x${string}`;
};

function copyState(data: BoardState['data']): StratagemsState {
	const cells: {[position: string]: ContractCell} = {};
	for (const [key, cell] of Object.entries(data.cells)) cells[key] = {...cell};
	return {
		cells,
		owners: {...data.owners},
		computedPoints: {...data.computedPoints},
	};
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
	const state = copyState(onchain.data);
	const simulation = new StratagemsContract(state, params.maxLife);
	const player = local.player?.toLowerCase() as `0x${string}` | undefined;

	const planned = new Map<string, number>();
	if (player) {
		for (const move of local.planned) {
			simulation.computeMove(player, cycleNumber, move);
			planned.set(move.position.toString(), move.color);
		}
	}

	const keys = new Set([...Object.keys(state.cells), ...planned.keys()]);
	const cells = new Map<string, CellView>();
	for (const key of keys) {
		const position = BigInt(key);
		const {x, y} = bigIntIDToXY(position);
		const {updatedCell} = simulation.getUpdatedCell(position, cycleNumber);
		const owner = state.owners[key]?.toLowerCase() as `0x${string}` | undefined;
		cells.set(key, {
			position,
			x,
			y,
			color: updatedCell.color,
			life: updatedCell.life,
			stake: updatedCell.stake,
			owner,
			mine: owner !== undefined && owner === player,
			planned: planned.get(key),
		});
	}
	return {cells, player};
}

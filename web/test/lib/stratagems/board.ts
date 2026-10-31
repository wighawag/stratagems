/**
 * Boards for stratagems' unit tests, played with the contract's own code
 * (`StratagemsSimulation.resolveMoves`, in the bytecode sandbox: `./simulation.ts`),
 * so a test's board is one the contract produces. Until step X2 they were
 * played with `stratagems-common`'s TypeScript copy of the rules.
 */
import {readable, writable} from 'svelte/store';
import {xyToBigIntID} from 'stratagems-common';
import {zeroAddress} from 'viem';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {BoardState} from '$lib/stratagems/board/indexed-board';
import {
	createMovesPreview,
	touchedBy,
	type StoredCell,
} from '$lib/stratagems/preview';
import type {LocalPlan} from '$lib/stratagems/view';
import {resolveMoves, SIMULATION_MAX_LIFE} from './simulation';

export const MAX_LIFE = SIMULATION_MAX_LIFE;
export const GEM = 10n ** 18n;

export const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
export const BOB = '0x0000000000000000000000000000000000000b0b' as const;
export const CAROL = '0x00000000000000000000000000000000000ca201' as const;

export type Played = {
	player: `0x${string}`;
	x: number;
	y: number;
	color: number;
};

export function emptyBoardData(): BoardState['data'] {
	return {
		cells: {},
		owners: {},
		commitments: {},
		placements: [],
		points: {
			global: {
				lastUpdateTime: 0,
				totalRewardPerPointAtLastUpdate: 0n,
				totalPoints: 0n,
			},
			fixed: {},
			shared: {},
		},
	};
}

/**
 * Play each cycle's moves in turn (each move one reveal of its own, by the
 * contract), and return the board as of `atCycle`, as the indexer would hold it.
 */
export async function boardAfter(
	cycles: {cycle: number; moves: Played[]}[],
	atCycle: number,
): Promise<BoardState> {
	const data = emptyBoardData();
	// the whole stored state, the records of the cycle's start included
	const stored = new Map<string, StoredCell>();
	for (const {cycle, moves} of cycles) {
		for (const move of moves) {
			const position = xyToBigIntID(move.x, move.y);
			const board = touchedBy([position])
				.map((id) => stored.get(id.toString()))
				.filter((cell): cell is StoredCell => cell !== undefined);
			const after = await resolveMoves(board, move.player, cycle, [
				{position, color: move.color},
			]);
			for (const cell of after) {
				const key = cell.position.toString();
				const written =
					stored.has(key) ||
					cell.cell.lastCycleUpdate !== 0 ||
					cell.cell.color !== 0;
				if (!written) continue;
				stored.set(key, cell);
				data.cells[key] = {...cell.cell};
				if (cell.owner === zeroAddress) delete data.owners[key];
				else data.owners[key] = cell.owner.toLowerCase() as `0x${string}`;
			}
		}
	}
	return {data, cycleNumber: atCycle};
}

/**
 * `local` with what its planned moves will do, as the app attaches it: the
 * preview store (`createMovesPreview`) run over `onchain` by the contract's
 * own code, once it is ready.
 */
export async function previewed(
	onchain: BoardState,
	local: LocalPlan,
): Promise<LocalPlan> {
	if (!local.player || local.planned.length === 0) return local;
	const preview = createMovesPreview({
		plan: readable(local),
		board: readable({step: 'Loaded' as const, ...onchain}),
		simulate: resolveMoves,
	});
	const settled = await new Promise<
		Extract<
			Parameters<Parameters<typeof preview.subscribe>[0]>[0],
			{step: 'Ready'} | {step: 'Failed'}
		>
	>((resolve) => {
		let done = false;
		let stop: (() => void) | undefined;
		stop = preview.subscribe((value) => {
			if (done) return;
			if (value.step === 'Ready' || value.step === 'Failed') {
				done = true;
				resolve(value);
				stop?.();
			}
		});
		if (done) stop();
	});
	if (settled.step === 'Failed') throw settled.error;
	return {...local, preview: settled.result};
}

export function boardStore(
	board: BoardState | undefined,
): OnchainStateStore<BoardState> & {set(board: BoardState): void} {
	const value = writable<OnchainStateValue<BoardState>>(
		board ? {step: 'Loaded', ...board} : {step: 'Unloaded'},
	);
	return {
		subscribe: value.subscribe,
		status: writable({loading: false}),
		async update() {},
		set: (next) => value.set({step: 'Loaded', ...next}),
	};
}

export const at = (x: number, y: number) => xyToBigIntID(x, y);

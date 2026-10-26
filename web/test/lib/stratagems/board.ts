/**
 * Boards for stratagems' unit tests, played with `stratagems-common`'s copy of
 * the contract's rules (`StratagemsContract.computeMove`), so a test's board is
 * one the contract could have produced.
 */
import {writable} from 'svelte/store';
import {
	StratagemsContract,
	xyToBigIntID,
	type ContractCell,
} from 'stratagems-common';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {BoardState} from '$lib/stratagems/board/indexed-board';

export const MAX_LIFE = 7;
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
		computedPoints: {},
	};
}

/** Play each cycle's moves in turn, and return the board as of `atCycle`. */
export function boardAfter(
	cycles: {cycle: number; moves: Played[]}[],
	atCycle: number,
): BoardState {
	const data = emptyBoardData();
	const state = {
		cells: data.cells as {[position: string]: ContractCell},
		owners: data.owners,
		computedPoints: data.computedPoints,
	};
	const simulation = new StratagemsContract(state, MAX_LIFE);
	for (const {cycle, moves} of cycles) {
		for (const move of moves) {
			simulation.computeMove(move.player, cycle, {
				position: xyToBigIntID(move.x, move.y),
				color: move.color,
			});
		}
	}
	for (const key of Object.keys(data.owners)) {
		data.owners[key] = data.owners[key].toLowerCase() as `0x${string}`;
	}
	return {data, cycleNumber: atCycle};
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

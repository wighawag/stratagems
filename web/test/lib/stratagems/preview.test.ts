import {describe, expect, it} from 'vitest';
import {get, writable} from 'svelte/store';
import {Color} from 'stratagems-common';
import type {OnchainStateValue} from '$lib/game/core/seams';
import type {BoardState} from '$lib/stratagems/board/indexed-board';
import {
	createMovesPreview,
	touchedBy,
	withPreview,
	type SimulateMoves,
	type StoredCell,
} from '$lib/stratagems/preview';
import {mergeBoardView, type LocalPlan} from '$lib/stratagems/view';
import {resolveMoves} from './simulation';
import {ALICE, BOB, MAX_LIFE, at, boardAfter} from './board';

/** A simulation that answers when told to, so a test decides the order answers land in. */
function controlledSimulation() {
	const calls: {
		moves: readonly {position: bigint; color: number}[];
		answer: () => Promise<void>;
	}[] = [];
	const simulate: SimulateMoves = (board, player, cycle, moves) =>
		new Promise<readonly StoredCell[]>((resolve, reject) => {
			calls.push({
				moves,
				answer: () =>
					resolveMoves(board, player, cycle, moves).then(resolve, reject),
			});
		});
	return {simulate, calls};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup() {
	const board = await boardAfter(
		[{cycle: 1, moves: [{player: ALICE, x: 0, y: 0, color: Color.Red}]}],
		2,
	);
	const plan = writable<LocalPlan>({planned: [], player: BOB});
	const boardStore = writable<OnchainStateValue<BoardState>>({
		step: 'Loaded',
		...board,
	});
	const {simulate, calls} = controlledSimulation();
	const preview = createMovesPreview({plan, board: boardStore, simulate});
	const shown = withPreview(plan, preview);
	const view = () =>
		mergeBoardView({
			onchain: board,
			local: get(shown),
			cycleNumber: 2,
			maxLife: MAX_LIFE,
		});
	const stop = shown.subscribe(() => {});
	return {plan, calls, view, stop};
}

describe('the planned moves, previewed by the contract', () => {
	it('reads every cell a move can: the moved cell and its four neighbours, each once', () => {
		expect(touchedBy([at(0, 0), at(1, 0)])).toEqual([
			at(0, 0),
			at(0, -1),
			at(-1, 0),
			at(0, 1),
			at(1, 0),
			at(1, -1),
			at(1, 1),
			at(2, 0),
		]);
	});

	it('shows the plan at once, and what it does when the contract has said', async () => {
		const {plan, calls, view, stop} = await setup();
		plan.set({planned: [{position: at(1, 0), color: Color.Blue}], player: BOB});
		// planned, and the neighbour as it is: the answer has not landed
		expect(view().cells.get(at(1, 0).toString())).toMatchObject({
			planned: Color.Blue,
			color: Color.None,
		});
		expect(view().cells.get(at(0, 0).toString())).toMatchObject({
			trend: 'grow',
			enemies: 0,
		});

		await calls[0].answer();
		await flush();
		expect(view().cells.get(at(1, 0).toString())).toMatchObject({
			planned: Color.Blue,
			color: Color.Blue,
			owner: BOB,
			mine: true,
		});
		expect(view().cells.get(at(0, 0).toString())).toMatchObject({
			trend: 'shrink',
			enemies: 1,
		});
		stop();
	});

	it('never draws the answer for an older plan over the plan as it is', async () => {
		const {plan, calls, view, stop} = await setup();
		plan.set({planned: [{position: at(1, 0), color: Color.Blue}], player: BOB});
		plan.set({planned: [{position: at(0, 1), color: Color.Red}], player: BOB});
		expect(calls).toHaveLength(2);

		// the first plan's answer lands last-but-one: dropped
		await calls[0].answer();
		await flush();
		expect(view().cells.get(at(1, 0).toString())).toBeUndefined();
		expect(view().cells.get(at(0, 0).toString())).toMatchObject({friends: 0});

		await calls[1].answer();
		await flush();
		expect(view().cells.get(at(0, 1).toString())).toMatchObject({
			planned: Color.Red,
			color: Color.Red,
		});
		expect(view().cells.get(at(0, 0).toString())).toMatchObject({friends: 1});
		stop();
	});

	it('asks nothing with no plan, or nobody playing', async () => {
		const {plan, calls, stop} = await setup();
		plan.set({planned: [{position: at(1, 0), color: Color.Blue}]});
		plan.set({planned: [], player: BOB});
		expect(calls).toHaveLength(0);
		stop();
	});
});

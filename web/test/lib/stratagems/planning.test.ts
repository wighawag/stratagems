import {describe, expect, it} from 'vitest';
import {get, writable, type Readable} from 'svelte/store';
import {Color} from 'stratagems-common';
import type {SubmissionState, SubmissionStore} from '$lib/game/core/submission';
import type {GameIdentity} from '$lib/game/identity';
import type {Move} from '$lib/stratagems/moves';
import {
	createPlanning,
	judgeCell,
	REFUSED_COMMITTED,
	REFUSED_EVIL,
	REFUSED_LIMIT,
	REFUSED_LOADING,
	REFUSED_OTHERS,
} from '$lib/stratagems/planning';
import {ALICE, BOB, MAX_LIFE, at, boardAfter, boardStore} from './board';

/**
 * At cycle 7: Alice's lone cell at 5,5 (placed in cycle 1) is at full life;
 * her cell at 0,0 died in cycle 3, outnumbered by Bob's four cells around 1,0,
 * which live on; 3,3 is Evil (both placed on it in cycle 1). 9,9 was never played.
 */
const BOARD = boardAfter(
	[
		{
			cycle: 1,
			moves: [
				{player: ALICE, x: 0, y: 0, color: Color.Blue},
				{player: ALICE, x: 5, y: 5, color: Color.Blue},
				{player: BOB, x: 1, y: 0, color: Color.Red},
				{player: BOB, x: 2, y: 0, color: Color.Red},
				{player: BOB, x: 1, y: 1, color: Color.Red},
				{player: BOB, x: 1, y: -1, color: Color.Red},
				{player: ALICE, x: 3, y: 3, color: Color.Blue},
				{player: BOB, x: 3, y: 3, color: Color.Red},
			],
		},
	],
	7,
);

describe("what a click may plan, judged at the cycle's start", () => {
	const judge = (
		x: number,
		y: number,
		player: `0x${string}` = ALICE,
		board = BOARD,
	) => judgeCell({board, position: at(x, y), player, maxLife: MAX_LIFE});

	it('lets anyone place on an empty cell or a dead one, whoever owned it', () => {
		expect(judge(9, 9)).toEqual({kind: 'place'});
		expect(judge(0, 0)).toEqual({kind: 'place'});
		expect(judge(0, 0, BOB)).toEqual({kind: 'place'});
	});

	it("refuses another player's living cell, and an Evil one, saying why", () => {
		expect(judge(1, 0)).toEqual({kind: 'refused', reason: REFUSED_OTHERS});
		expect(judge(3, 3)).toEqual({kind: 'refused', reason: REFUSED_EVIL});
		expect(judge(3, 3, BOB)).toEqual({kind: 'refused', reason: REFUSED_EVIL});
	});

	it("offers only the removal of the player's own full-life cell", () => {
		expect(judge(5, 5)).toEqual({kind: 'remove'});
		expect(judge(5, 5, BOB)).toEqual({kind: 'refused', reason: REFUSED_OTHERS});
	});

	it("re-places the player's own living cell below full life", () => {
		const early = {...BOARD, cycleNumber: 2};
		expect(judge(5, 5, ALICE, early)).toEqual({kind: 'replace'});
	});
});

function fakeSubmission(initial: SubmissionState<Move> = {step: 'Idle'}) {
	const state = writable<SubmissionState<Move>>(initial);
	return {
		subscribe: state.subscribe,
		get value() {
			return get(state);
		},
		set: state.set,
		plan(actions: readonly Move[]) {
			state.set(
				actions.length === 0
					? {step: 'Idle'}
					: {step: 'Planning', cycleNumber: 8, actions},
			);
		},
	} as unknown as SubmissionStore<GameIdentity, Move> & {
		set(state: SubmissionState<Move>): void;
	};
}

function setup(params?: {
	max?: number;
	faction?: number;
	board?: ReturnType<typeof boardStore>;
}) {
	const submission = fakeSubmission();
	const identity = writable<GameIdentity | undefined>(ALICE);
	const faction: Readable<number | undefined> = writable(
		params?.faction ?? Color.Green,
	);
	const planning = createPlanning({
		submission,
		maxOpenableActions: writable(params?.max),
		onchainState: params?.board ?? boardStore(BOARD),
		identity,
		faction,
		maxLife: MAX_LIFE,
	});
	return {submission, planning, identity};
}

const moves = (submission: {value: SubmissionState<Move>}) =>
	'actions' in submission.value ? submission.value.actions : [];

describe('what a click means', () => {
	it("plans an allowed cell in the player's faction, and takes it back on a second click", () => {
		const {submission, planning} = setup({faction: Color.Purple});
		planning.click(at(9, 9));
		expect(moves(submission)).toEqual([
			{position: at(9, 9), color: Color.Purple},
		]);
		expect(get(planning.selected)).toMatchObject({
			position: at(9, 9),
			planned: Color.Purple,
		});
		planning.click(at(9, 9));
		expect(moves(submission)).toEqual([]);
		expect(get(planning.selected)?.planned).toBeUndefined();
	});

	it('selects a refused cell and says why, planning nothing', () => {
		const {submission, planning} = setup();
		planning.click(at(1, 0));
		expect(moves(submission)).toEqual([]);
		expect(get(planning.selected)).toMatchObject({
			position: at(1, 0),
			reason: REFUSED_OTHERS,
			canRemove: false,
		});
	});

	it("opens the land menu on the player's own full-life cell, whose removal is a move of no colour", () => {
		const {submission, planning} = setup();
		planning.click(at(5, 5));
		expect(moves(submission)).toEqual([]);
		expect(get(planning.selected)).toMatchObject({
			position: at(5, 5),
			canRemove: true,
		});
		planning.remove(at(5, 5));
		expect(moves(submission)).toEqual([
			{position: at(5, 5), color: Color.None},
		]);
		expect(get(planning.selected)).toMatchObject({
			planned: Color.None,
			canRemove: false,
		});
		// a click on the planned removal takes it back
		planning.click(at(5, 5));
		expect(moves(submission)).toEqual([]);
	});

	it("removes nothing that is not the player's own full-life cell", () => {
		const {submission, planning} = setup();
		planning.remove(at(1, 0));
		planning.remove(at(9, 9));
		planning.remove(at(0, 0));
		expect(moves(submission)).toEqual([]);
	});

	it("stops at the turn's limit, and says so", () => {
		const {submission, planning} = setup({max: 1});
		planning.click(at(9, 9));
		planning.click(at(8, 8));
		expect(moves(submission)).toHaveLength(1);
		expect(get(planning.selected)).toMatchObject({
			position: at(8, 8),
			reason: REFUSED_LIMIT,
		});
		planning.click(at(5, 5));
		expect(get(planning.selected)?.canRemove).toBe(false);
	});

	it('plans nothing once the turn is committed, and says so', () => {
		const {submission, planning} = setup();
		submission.set({step: 'Committed', cycleNumber: 8, actions: []});
		planning.click(at(9, 9));
		expect(get(planning.selected)).toMatchObject({reason: REFUSED_COMMITTED});
		planning.deselect();
		expect(get(planning.selected)).toBeUndefined();
	});

	it('refuses a click before the board has loaded, saying so, and plans once it has', () => {
		const board = boardStore(undefined);
		const {submission, planning} = setup({board});
		planning.click(at(9, 9));
		expect(moves(submission)).toEqual([]);
		expect(get(planning.selected)).toMatchObject({
			position: at(9, 9),
			reason: REFUSED_LOADING,
		});
		board.set(BOARD);
		planning.click(at(9, 9));
		expect(moves(submission)).toHaveLength(1);
	});

	it('does nothing with nobody playing', () => {
		const {submission, planning, identity} = setup();
		identity.set(undefined);
		planning.click(at(9, 9));
		expect(moves(submission)).toEqual([]);
		expect(get(planning.selected)).toBeUndefined();
	});
});

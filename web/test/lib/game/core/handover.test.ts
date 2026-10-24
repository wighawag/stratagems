import {describe, expect, it} from 'vitest';
import {get, writable, type Readable} from 'svelte/store';
import {
	heldTurnUntilBoardReleases,
	holdBoardUntilCycleEnds,
	rememberTurn,
} from '$lib/game/core/handover';
import type {SubmissionState} from '$lib/game/core/submission';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {PlayWindow} from '$lib/game/core/refresh';

type Board = {marks: Map<string, number>; cycleNumber: number};

/** A state store a test drives by hand, in the shape a game's poller has. */
function fakeBoard(initial: OnchainStateValue<Board>) {
	const store = writable<OnchainStateValue<Board>>(initial);
	const state: OnchainStateStore<Board> = {
		subscribe: store.subscribe,
		status: writable({loading: false}),
		update: async () => {},
	};
	return {state, set: store.set};
}

const loaded = (cycleNumber: number, marks: Record<string, number>) => ({
	step: 'Loaded' as const,
	cycleNumber,
	marks: new Map(Object.entries(marks)),
});

/** The rule a game supplies: keep what is already on screen. */
const holdEverythingShown = ({
	shown,
	latest,
}: {
	shown: Board;
	latest: Board;
}): Board => {
	const marks = new Map<string, number>();
	for (const key of latest.marks.keys()) {
		const previous = shown.marks.get(key);
		if (previous !== undefined) marks.set(key, previous);
	}
	return {marks, cycleNumber: latest.cycleNumber};
};

function setup(initial: OnchainStateValue<Board>) {
	const board = fakeBoard(initial);
	const phase = writable<PlayWindow>({phase: 'play'});
	const cycleNumber = writable(2);
	const held = holdBoardUntilCycleEnds<Board>({
		state: board.state,
		phase,
		cycleNumber,
		hold: holdEverythingShown,
	});
	// Subscribed, because the memory only advances while something is watching -
	// which is exactly how it is used.
	const seen: OnchainStateValue<Board>[] = [];
	const holding: (number | undefined)[] = [];
	held.board.subscribe((v) => seen.push(v));
	held.holding.subscribe((v) => holding.push(v));
	return {...board, phase, cycleNumber, held, seen, holding};
}

describe('holding the board until the cycle is over', () => {
	it('passes the chain straight through while the cycle is playable', () => {
		const t = setup(loaded(2, {a: 1}));
		t.set(loaded(2, {a: 3}));

		expect(get(t.held.board)).toMatchObject({
			step: 'Loaded',
			marks: new Map([['a', 3]]),
		});
		expect(get(t.held.holding)).toBeUndefined();
	});

	it('withholds what the resolving cycle changed, and lets it out together', () => {
		const t = setup(loaded(2, {a: 1, b: 1}));
		t.phase.set({phase: 'wait'});

		// Two reveals land, one at a time, which is the whole problem: drawn as
		// they arrive they show a simultaneous cycle playing out in payment order.
		t.set(loaded(2, {a: 5, b: 1}));
		expect(get(t.held.board)).toMatchObject({
			marks: new Map([
				['a', 1],
				['b', 1],
			]),
		});
		t.set(loaded(2, {a: 5, b: 9}));
		expect(get(t.held.board)).toMatchObject({
			marks: new Map([
				['a', 1],
				['b', 1],
			]),
		});

		// The cycle ends. Everything appears at once.
		t.phase.set({phase: 'play'});
		expect(get(t.held.board)).toMatchObject({
			marks: new Map([
				['a', 5],
				['b', 9],
			]),
		});
	});

	it('publishes WHICH cycle it is holding, so the overlay releases in the same propagation', () => {
		const t = setup(loaded(2, {a: 1}));
		expect(get(t.held.holding)).toBeUndefined();

		t.phase.set({phase: 'wait'});
		t.set(loaded(2, {a: 5}));
		expect(get(t.held.holding)).toBe(2);

		t.phase.set({phase: 'play'});
		expect(get(t.held.holding)).toBeUndefined();
	});

	it('forgets what it was holding when the board stops being known to be true', () => {
		// An account switch or a chain reset. There is nothing to hold and nothing
		// to synchronise, and holding against a board from another chain would
		// draw a world that never existed.
		const t = setup(loaded(2, {a: 1}));
		t.phase.set({phase: 'wait'});
		t.set({step: 'Unloaded'});
		expect(get(t.held.board)).toEqual({step: 'Unloaded'});

		t.set(loaded(2, {a: 5}));
		// Nothing on screen to hold against, so the newest answer IS the board.
		expect(get(t.held.board)).toMatchObject({marks: new Map([['a', 5]])});
	});

	it('does not resurrect what has left the fetched region', () => {
		const t = setup(loaded(2, {a: 1, b: 1}));
		t.phase.set({phase: 'wait'});
		// The player panned: `b` is no longer being fetched at all.
		t.set(loaded(2, {a: 5}));
		expect(get(t.held.board)).toMatchObject({marks: new Map([['a', 1]])});
	});

	it('hands the game the board on screen, the chain, and the cycle being resolved', () => {
		const calls: unknown[] = [];
		const board = fakeBoard(loaded(2, {a: 1}));
		const phase = writable<PlayWindow>({phase: 'play'});
		const cycleNumber = writable(7);
		const held = holdBoardUntilCycleEnds<Board>({
			state: board.state,
			phase,
			cycleNumber,
			hold: (params) => {
				calls.push(params);
				return params.shown;
			},
		});
		held.board.subscribe(() => {});

		phase.set({phase: 'wait'});
		board.set(loaded(2, {a: 4}));

		expect(calls.at(-1)).toMatchObject({
			shown: {marks: new Map([['a', 1]])},
			latest: {marks: new Map([['a', 4]])},
			resolvingCycleNumber: 7,
		});
	});

	it('does not hand the game the store\u2019s own Loaded marker', () => {
		// A game\u2019s rule is written against the state IT defined. Passing the
		// wrapper through would put a field on the board that the game never put
		// there, and it would survive into everything the hold returns.
		let sawStep: unknown = 'not called';
		const board = fakeBoard(loaded(2, {a: 1}));
		const phase = writable<PlayWindow>({phase: 'play'});
		const held = holdBoardUntilCycleEnds<Board>({
			state: board.state,
			phase,
			cycleNumber: writable(2),
			hold: ({shown, latest}) => {
				sawStep = (latest as unknown as {step?: unknown}).step;
				return shown;
			},
		});
		held.board.subscribe(() => {});
		phase.set({phase: 'wait'});
		board.set(loaded(2, {a: 4}));

		expect(sawStep).toBeUndefined();
	});
});

describe('the turn the submission no longer carries', () => {
	function fakeSubmission() {
		const store = writable<SubmissionState<{cellID: bigint}>>({step: 'Idle'});
		return {
			submission: store as Readable<SubmissionState<{cellID: bigint}>>,
			set: store.set,
		};
	}

	it('remembers the last turn the submission held, empty included', () => {
		const {submission, set} = fakeSubmission();
		const remembered = rememberTurn(submission);
		const seen: unknown[] = [];
		remembered.subscribe((v) => seen.push(v));

		set({step: 'Planning', cycleNumber: 2, actions: [{cellID: 1n}]});
		expect(get(remembered)).toEqual({cycleNumber: 2, actions: [{cellID: 1n}]});

		// A player who plans a path and then CLEARS it has planned nothing. A
		// memory that only took non-empty turns would redraw the path they
		// deleted for the whole of the cycle it resolves in.
		set({step: 'Committed', cycleNumber: 2, actions: []});
		expect(get(remembered)).toEqual({cycleNumber: 2, actions: []});

		// `Revealed` carries no actions, which is the reason any of this exists.
		set({step: 'Revealed', cycleNumber: 2});
		expect(get(remembered)).toEqual({cycleNumber: 2, actions: []});
	});

	it('bridges the gap between the submission dropping a turn and the board releasing it', () => {
		const {submission, set} = fakeSubmission();
		const holding = writable<number | undefined>(undefined);
		const held = heldTurnUntilBoardReleases({submission, holding});
		held.subscribe(() => {});

		set({step: 'Committed', cycleNumber: 2, actions: [{cellID: 1n}]});
		// Nothing being held: the submission is the only thing drawing the turn, and
		// this must not compete with it.
		expect(get(held)).toBeUndefined();

		// The reveal lands. The submission drops the actions; the board withholds
		// what they did until the cycle is over. Without the bridge there is a window
		// here in which the player is shown NEITHER copy of their own turn.
		holding.set(2);
		set({step: 'Revealed', cycleNumber: 2});
		expect(get(held)).toEqual([{cellID: 1n}]);

		holding.set(undefined);
		expect(get(held)).toBeUndefined();
	});

	it('refuses a turn remembered from an EARLIER cycle', () => {
		// Otherwise a turn from a previous cycle is resurrected over a cycle in
		// which the player planned nothing at all.
		const {submission, set} = fakeSubmission();
		const holding = writable<number | undefined>(undefined);
		const held = heldTurnUntilBoardReleases({submission, holding});
		held.subscribe(() => {});

		set({step: 'Revealing', cycleNumber: 2, actions: [{cellID: 1n}]});
		set({step: 'Revealed', cycleNumber: 2});
		holding.set(3);

		expect(get(held)).toBeUndefined();
	});
});

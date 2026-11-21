// No `.svelte.` infix, so this runs in the `server` project: node, no DOM.
import {afterEach, describe, expect, it, vi} from 'vitest';
import {get, writable, type Readable} from 'svelte/store';
import type {CycleConfig} from '$lib/game/core/cycle';
import type {OnchainStateStatus} from '$lib/game/core/seams';
import {createIndexedState} from '$lib/indexer/indexed-state';
import type {StateFollowerSpec, StateRead} from '$lib/indexer/follower';

/**
 * THE GAME'S INDEXED STATE (`$lib/indexer/indexed-state.ts`), held to its
 * seam with the indexer itself faked: what the tab does with a port, a
 * progress readable and the follower's reads, and when. The worker, its fold
 * and GraphQL are etherfold's (and `./follower.ts`'s, tested beside this), and
 * the reference game's board runs the whole of it against a real fold
 * (`test/lib/placement/indexer.test.ts`).
 *
 * So `@etherfold/browser`'s port and progress are fakes this file drives: a
 * port that records being stopped and closed, a progress readable the test
 * sets and that records being closed, and the `onConnect` it was handed, for a
 * refusal. The follower is the real one, over a spec whose reads the test
 * answers (each one held until the test releases it), so a read can land
 * after the store has stopped.
 */

type Fakes = {
	connects: {
		onConnect?: (outcome: {accepted: boolean; error?: unknown}) => void;
	}[];
	ports: {stopped: number; closed: number}[];
	progress: {
		store: {set(value: unknown): void};
		closed: number;
	}[];
};

const fakes = vi.hoisted((): Fakes => ({
	connects: [],
	ports: [],
	progress: [],
}));

vi.mock('@etherfold/browser', () => ({
	connectToIndexerHost: (
		_host: unknown,
		options: {
			onConnect?: (outcome: {accepted: boolean; error?: unknown}) => void;
		},
	) => {
		fakes.connects.push({onConnect: options.onConnect});
		const port = {stopped: 0, closed: 0};
		fakes.ports.push(port);
		return {
			onStateMoved: () => () => undefined,
			stopIndexing: async () => {
				port.stopped++;
			},
			close: () => {
				port.closed++;
			},
		};
	},
	createProgressReadable: () => {
		const store = writableOf(undefined);
		const entry = {store, closed: 0};
		fakes.progress.push(entry);
		return {
			subscribe: store.subscribe,
			close: () => {
				entry.closed++;
			},
		};
	},
	dedicatedWorkerHost: () => {
		throw new Error('no worker in this test');
	},
}));

vi.mock('@etherfold/graphql/worker', () => ({
	workerExecutor: () => async () => ({data: {}}),
}));

/** A writable the mock makes without importing svelte/store. */
function writableOf<T>(initial: T) {
	let value = initial;
	const listeners = new Set<(value: T) => void>();
	return {
		set(next: T) {
			value = next;
			for (const listener of listeners) listener(value);
		},
		subscribe(listener: (value: T) => void) {
			listeners.add(listener);
			listener(value);
			return () => listeners.delete(listener);
		},
	};
}

afterEach(() => {
	fakes.connects.length = 0;
	fakes.ports.length = 0;
	fakes.progress.length = 0;
});

type Data = {cells: number; cycle?: number};
type State = {cells: number; cycleNumber: number};

/** A game of one part whose reads the test answers, one at a time. */
function heldGame() {
	const pending: {
		account: string;
		answer: (data: Data, block: number) => void;
		fail: (error: Error) => void;
	}[] = [];
	const spec: StateFollowerSpec<'board', Data> = {
		parts: ['board'],
		partOf: {cell: 'board'},
		read: (_execute, _parts, {account}) =>
			new Promise<StateRead<Data>>((resolve, reject) => {
				pending.push({
					account,
					answer: (data, block) => resolve({data, block}),
					fail: reject,
				});
			}),
	};
	return {spec, pending};
}

const MANUAL: CycleConfig = {
	commitPhaseDuration: 0,
	revealPhaseDuration: 0,
	startTime: 0,
	commitTimeAllowance: 0,
	policy: 'manual',
};

const TIMED: CycleConfig = {
	commitPhaseDuration: 60,
	revealPhaseDuration: 40,
	startTime: 1000,
	commitTimeAllowance: 0,
	policy: 'timed',
};

function indexedState(options: {
	spec: StateFollowerSpec<'board', Data>;
	cycle?: CycleConfig;
	getBlock?: (args: {blockNumber: bigint}) => Promise<{timestamp: bigint}>;
	player?: Readable<string | undefined>;
	gate?: Readable<boolean>;
}) {
	let hosts = 0;
	const state = createIndexedState<'board', Data, State>({
		provider: {request: async () => undefined} as never,
		publicClient: {
			getBlock: options.getBlock ?? (async () => ({timestamp: 0n})),
		},
		cycle: options.cycle ?? MANUAL,
		worker: {kind: 'live', name: 'indexed-state-test'},
		host: () => {
			hosts++;
			return {} as never;
		},
		source: {},
		finality: 12,
		follower: options.spec,
		player: options.player,
		cycleOf: (data) =>
			data.cycle === undefined ? undefined : {cycleNumber: data.cycle},
		present: (data, cycleNumber) => ({cells: data.cells, cycleNumber}),
		gate: options.gate,
	});
	return {state, hosts: () => hosts};
}

/** Let every queued promise run. */
async function settle() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function lastStatus(state: {status: Readable<OnchainStateStatus>}) {
	return get(state.status);
}

describe("a game's indexed state", () => {
	it('publishes the read stamped with the cycle the game folded, loading until the worker is at the tip', async () => {
		const game = heldGame();
		const {state} = indexedState({spec: game.spec});
		const stop = state.subscribe(() => undefined);
		await settle();
		expect(game.pending).toHaveLength(1);

		game.pending[0].answer({cells: 3, cycle: 5}, 7);
		await settle();
		expect(get(state)).toEqual({step: 'Loaded', cells: 3, cycleNumber: 5});
		expect(lastStatus(state).loading).toBe(true);

		fakes.progress[0].store.set({phase: 'at-tip', lastToBlock: 9});
		await settle();
		expect(lastStatus(state)).toMatchObject({loading: false});
		expect(lastStatus(state).error).toBeUndefined();
		expect(get(state.progress)).toEqual({phase: 'at-tip', lastToBlock: 9});
		stop();
	});

	it("stamps a timed deployment's state from the timestamp of the block it is as of, the tip's once at it", async () => {
		const game = heldGame();
		const asked: bigint[] = [];
		const {state} = indexedState({
			spec: game.spec,
			cycle: TIMED,
			getBlock: async ({blockNumber}) => {
				asked.push(blockNumber);
				// block n at 1000 + 100 n: cycle 2 + n
				return {timestamp: 1000n + 100n * blockNumber};
			},
		});
		const stop = state.subscribe(() => undefined);
		await settle();
		game.pending[0].answer({cells: 1}, 1);
		await settle();
		expect(asked).toEqual([1n]);
		expect(get(state)).toMatchObject({step: 'Loaded', cycleNumber: 3});

		// a quiet chain: no read, but the worker folded up to block 4
		fakes.progress[0].store.set({phase: 'at-tip', lastToBlock: 4});
		await settle();
		expect(asked).toEqual([1n, 4n]);
		expect(get(state)).toMatchObject({step: 'Loaded', cycleNumber: 6});
		stop();
	});

	it('says the worker refused the tab, and that the indexer stopped', async () => {
		const refusedGame = heldGame();
		const refused = indexedState({spec: refusedGame.spec}).state;
		const stopRefused = refused.subscribe(() => undefined);
		await settle();
		fakes.connects[0].onConnect?.({accepted: false, error: 'busy'});
		await settle();
		expect(lastStatus(refused)).toEqual({
			loading: false,
			error: {message: 'the indexer refused this tab', cause: 'busy'},
		});
		stopRefused();

		const stoppedGame = heldGame();
		const stopped = indexedState({spec: stoppedGame.spec}).state;
		const stopStopped = stopped.subscribe(() => undefined);
		await settle();
		fakes.progress[1].store.set({phase: 'catching-up', failure: 'gone'});
		await settle();
		expect(lastStatus(stopped)).toEqual({
			loading: false,
			error: {message: 'the indexer stopped', cause: 'gone'},
		});
		stopStopped();
	});

	it('says a read failed and keeps the last good state', async () => {
		const game = heldGame();
		const {state} = indexedState({spec: game.spec});
		const stop = state.subscribe(() => undefined);
		await settle();
		game.pending[0].answer({cells: 2, cycle: 3}, 5);
		await settle();

		const reading = state.update();
		await settle();
		game.pending[1].fail(new Error('rows-examined-bound'));
		await reading;
		await settle();
		expect(lastStatus(state).error).toMatchObject({
			message: 'rows-examined-bound',
		});
		expect(get(state)).toEqual({step: 'Loaded', cells: 2, cycleNumber: 3});
		stop();
	});

	it('reads again when asked, for the player it is told', async () => {
		const game = heldGame();
		const player = writable<string | undefined>('0xABC');
		const {state} = indexedState({spec: game.spec, player});
		const stop = state.subscribe(() => undefined);
		await settle();
		expect(game.pending.map((read) => read.account)).toContain('0xabc');
		for (const read of game.pending) read.answer({cells: 1}, 2);
		await settle();

		const reading = state.update();
		await settle();
		game.pending[game.pending.length - 1].answer({cells: 4}, 3);
		await reading;
		await settle();
		expect(get(state)).toMatchObject({step: 'Loaded', cells: 4});
		stop();
	});

	it('starts no worker outside a browser, and is refused without a worker or a host', () => {
		let started = 0;
		const game = heldGame();
		const base = {
			provider: {request: async () => undefined} as never,
			publicClient: {getBlock: async () => ({timestamp: 0n})},
			cycle: MANUAL,
			worker: {kind: 'live', name: 'indexed-state-test'} as const,
			source: {},
			finality: 12,
			follower: game.spec,
			cycleOf: () => undefined,
			present: (data: Data, cycleNumber: number) => ({...data, cycleNumber}),
		};
		const state = createIndexedState({
			...base,
			startWorker: () => {
				started++;
				throw new Error('no worker here');
			},
		});
		expect(get(state)).toEqual({step: 'Unloaded'});
		expect(started).toBe(0);
		expect(() => createIndexedState(base)).toThrow(
			/needs the game's worker \(startWorker\) or a host/,
		);
	});

	// What the rebuild on `createIndexed` (jolly-roger's `indexed.ts`) gains.

	it('closes the progress readable when its last subscriber leaves', async () => {
		const game = heldGame();
		const {state} = indexedState({spec: game.spec});
		const stop = state.subscribe(() => undefined);
		await settle();
		expect(fakes.progress).toHaveLength(1);
		stop();
		await settle();
		expect(fakes.progress[0].closed).toBe(1);
		expect(fakes.ports[0]).toEqual({stopped: 1, closed: 1});
	});

	it('publishes no read still in flight once its last subscriber has left', async () => {
		const game = heldGame();
		const {state} = indexedState({spec: game.spec});
		const statuses: OnchainStateStatus[] = [];
		const stopStatus = state.status.subscribe((s) => statuses.push(s));
		const stop = state.subscribe(() => undefined);
		await settle();
		stop();
		await settle();
		const before = statuses.length;
		game.pending[0].answer({cells: 9, cycle: 4}, 8);
		await settle();
		expect(statuses).toHaveLength(before);
		expect(get(state.progress)).toBeUndefined();
		stopStatus();
	});

	it("publishes no stamp still waiting for its block's timestamp once its last subscriber has left", async () => {
		const timedGame = heldGame();
		let release: (() => void) | undefined;
		const timed = indexedState({
			spec: timedGame.spec,
			cycle: TIMED,
			getBlock: () =>
				new Promise((resolve) => {
					release = () => resolve({timestamp: 1100n});
				}),
		}).state;
		const timedStatuses: OnchainStateStatus[] = [];
		const stopTimedStatus = timed.status.subscribe((s) =>
			timedStatuses.push(s),
		);
		const values: unknown[] = [];
		const stopTimed = timed.subscribe((v) => values.push(v));
		await settle();
		timedGame.pending[0].answer({cells: 1}, 1);
		await settle();
		expect(release).toBeDefined();
		stopTimed();
		const timedBefore = timedStatuses.length;
		release!();
		await settle();
		expect(timedStatuses).toHaveLength(timedBefore);
		expect(values).toEqual([{step: 'Unloaded'}]);
		stopTimedStatus();
	});

	it('starts nothing while its gate is closed, starts once it opens, and stops when it closes', async () => {
		const game = heldGame();
		const gate = writable(false);
		const {state, hosts} = indexedState({spec: game.spec, gate});
		const stop = state.subscribe(() => undefined);
		await settle();
		expect(hosts()).toBe(0);
		expect(game.pending).toHaveLength(0);

		gate.set(true);
		await settle();
		expect(hosts()).toBe(1);
		game.pending[0].answer({cells: 5, cycle: 2}, 3);
		await settle();
		expect(get(state)).toMatchObject({step: 'Loaded', cells: 5});

		gate.set(false);
		await settle();
		expect(fakes.ports[0]).toEqual({stopped: 1, closed: 1});
		expect(fakes.progress[0].closed).toBe(1);
		stop();
	});
});

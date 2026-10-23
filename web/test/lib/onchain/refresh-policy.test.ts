import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {writable} from 'svelte/store';
import {createPollingOnchainState} from '$lib/onchain/state';
import type {ChainTimeStore, SyncedTime} from '$lib/game/core/chain-time';
import type {CycleInfo, CycleInfoStore} from '$lib/game/core/cycle';
import type {Camera, CameraWatcher} from '$lib/game/render/camera';
import type {TypedPublicClient} from '$lib/core/connection/types';

/**
 * THE POLICY IS THE POLLER'S, not the app's, and this is what pins that.
 *
 * `game/core/refresh.ts` is tested on its own next door; the risk this file
 * covers is different and is the one that costs a whole game: the poller
 * quietly not running the policy at all. Nothing about a board that refreshes
 * every 5s instead of every 1.5s looks broken in a screenshot, in a typecheck
 * or in a unit test of either piece, which is exactly how the fault was
 * reported from PLAY rather than found by testing.
 */

const FETCH_INTERVAL = 5_000;

function cycleStore(initial: CycleInfo) {
	const store = writable<CycleInfo>(initial);
	const cycleInfo: CycleInfoStore = {
		subscribe: store.subscribe,
		now: () => initial,
		fromTime: () => initial,
	};
	return {cycleInfo, set: store.set};
}

function timed(currentCycleNumber: number, isCommitPhase: boolean): CycleInfo {
	return {
		type: 'timed',
		currentCycleNumber,
		isCommitPhase,
		timeLeftInCycle: 10,
		timeInCurrentCycle: 0,
		timeLeftInPhase: 10,
		timeLeftForCommitEnd: 10,
		timeLeftForRevealEnd: 10,
		currentPhaseDuration: 20,
		revealOpensAt: 10,
		config: {
			commitPhaseDuration: 10,
			revealPhaseDuration: 10,
			startTime: 0,
			commitTimeAllowance: 1,
			policy: 'timed',
		},
	};
}

function harness(
	initial: CycleInfo,
	refreshPolicy: false | undefined = undefined,
) {
	const {cycleInfo, set} = cycleStore(initial);

	const camera: CameraWatcher = writable<Camera>({
		x: 0,
		y: 0,
		width: 10,
		height: 10,
	});

	// `lastSync` present is what tells the poller chain time has been pinned to
	// a block; without it the scope stays undefined and nothing ever fetches.
	const time = writable<SyncedTime>({
		value: 0,
		lastSync: {timestampMS: 0, blockNumber: 100, averageBlockTime: 1},
	});
	const chainTime: ChainTimeStore = {subscribe: time.subscribe, now: () => 0};

	/**
	 * The cycle the reader STAMPS, when it is not simply the one asked for.
	 * Standing in for a chain that has not yet mined past the boundary the
	 * client's clock has crossed, which is the whole reason the settle exists.
	 */
	let boardCycleNumber: number | undefined;
	const read = vi.fn(
		async ({expectedCycleNumber}: {expectedCycleNumber: number}) => ({
			cells: new Map(),
			cycleNumber: boardCycleNumber ?? expectedCycleNumber,
		}),
	);

	const store = createPollingOnchainState<{cells: Map<bigint, unknown>}>({
		publicClient: {
			getBlockNumber: async () => 100n,
		} as unknown as TypedPublicClient,
		cycleDuration: 20,
		camera,
		cycleInfo,
		chainTime,
		zonesForCamera: () => [0n],
		read,
		emptyState: () => ({cells: new Map()}),
		config: {fetchInterval: FETCH_INTERVAL, refreshPolicy},
	});

	return {
		store,
		read,
		setCycleNumber: set,
		setBoardCycleNumber: (cycleNumber: number | undefined) => {
			boardCycleNumber = cycleNumber;
		},
	};
}

describe('createPollingOnchainState: the cycle-edge refresh policy', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// The polling store and the policy both refuse to run off-browser
		// (ADR-0002), so the tests declare the global their guards look for.
		vi.stubGlobal('window', {});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('refreshes faster than the interval while a cycle is resolving', async () => {
		// The reveal phase. At the plain 5s interval a spectating browser learns
		// about another player's move up to a whole interval late, which reads as
		// the board ignoring the one moment the game is about.
		const {store, read} = harness(timed(7, false));
		const off = store.subscribe(() => {});
		await vi.waitFor(() => expect(read).toHaveBeenCalled());

		read.mockClear();
		// One plain interval's worth of time. On the interval alone that is one
		// fetch; the reveal cadence is 1.5s, so it must be several.
		await vi.advanceTimersByTimeAsync(FETCH_INTERVAL);
		expect(read.mock.calls.length).toBeGreaterThan(1);
		off();
	});

	it('leaves the commit phase to the plain interval', async () => {
		// Nothing on the board can change while commitments are open, so a second
		// cadence there would only be a second bill from the RPC. The grace after
		// a reveal window is the refresh module's own test; this starts in the
		// commit phase and never leaves it, so no grace is owed.
		const {store, read} = harness(timed(7, true));
		const off = store.subscribe(() => {});
		await vi.waitFor(() => expect(read).toHaveBeenCalled());

		read.mockClear();
		await vi.advanceTimersByTimeAsync(FETCH_INTERVAL * 2);
		// Two intervals: the interval's own two fetches, and nothing besides.
		expect(read.mock.calls.length).toBeLessThanOrEqual(2);
		off();
	});

	it('keeps fetching at a cycle boundary until the board has caught up', async () => {
		// THE POINT IS THE RETRY, and saying so precisely matters because the
		// obvious version of this test proves nothing: changing the cycle changes
		// the poller's scope key, so ONE refetch happens whether the policy exists
		// or not. Deleting the policy left that version passing.
		//
		// What the policy adds is what happens when that one fetch comes back
		// still behind - the chain has not mined past the boundary the client's
		// clock already crossed. Without it the board sits on last cycle's
		// positions for a whole interval (or longer, once the refusal turns into
		// backoff behind a health banner). With it, the fetch repeats every 400ms
		// until the board's own cycle reaches the clock's.
		const {store, read, setCycleNumber, setBoardCycleNumber} = harness(
			timed(7, false),
		);
		const off = store.subscribe(() => {});
		await vi.waitFor(() => expect(read).toHaveBeenCalled());

		// The chain is behind: every read lands, but reports the old cycle.
		setBoardCycleNumber(7);
		read.mockClear();
		// Into the commit phase of the next cycle: the transition it triggers on.
		setCycleNumber(timed(8, true));

		// Well under one plain interval, so the scope change accounts for exactly
		// one of these and every other one is the settle retrying.
		await vi.advanceTimersByTimeAsync(1600);
		expect(read.mock.calls.length).toBeGreaterThan(2);
		expect(read.mock.calls[0][0].expectedCycleNumber).toBe(8);

		// That the retrying STOPS once the board catches up is pinned precisely in
		// `game/core/refresh.test.ts`, and deliberately not re-asserted here: the
		// reveal cadence's grace period is still running at this point in a real
		// poller, so a count taken here would be measuring both policies at once
		// and would fail for a reason that has nothing to do with the settle.
		off();
	});

	it('stops the policy with the last subscriber', async () => {
		// The extra cadences exist to feed a board somebody is looking at. Left
		// running after teardown they are an invisible, permanent load on the RPC
		// - the class of leak the polling store's own start/stop already avoids,
		// which is why the policy is tied to the same lifetime rather than a
		// second one that can disagree.
		const {store, read} = harness(timed(7, false));
		const off = store.subscribe(() => {});
		await vi.waitFor(() => expect(read).toHaveBeenCalled());

		off();
		read.mockClear();
		await vi.advanceTimersByTimeAsync(FETCH_INTERVAL * 2);
		expect(read).not.toHaveBeenCalled();
	});

	it('can be turned off, for a game that wants the interval alone', async () => {
		// A game with a long cycle, or one paying per RPC call, may not want the
		// extra cadences. Opting out has to be a real switch rather than a comment
		// in the docs, and this is the same reveal-phase setup as the first test,
		// which is what makes the comparison mean anything.
		const {store, read} = harness(timed(7, false), false);
		const off = store.subscribe(() => {});
		await vi.waitFor(() => expect(read).toHaveBeenCalled());

		read.mockClear();
		await vi.advanceTimersByTimeAsync(FETCH_INTERVAL);
		// The interval alone: one fetch, where the first test saw several.
		expect(read.mock.calls.length).toBeLessThanOrEqual(1);
		off();
	});
});

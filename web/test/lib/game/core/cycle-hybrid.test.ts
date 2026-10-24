import {describe, expect, it, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import {
	createCycleTrackers,
	createHybridCycleTrackers,
	predictCycle,
	staticCycleConfig,
	timingsOf,
	type CycleConfig,
	type HybridCycleInfo,
	type CycleReading,
} from '$lib/game/core/cycle';
import type {ChainTimeStore, SyncedTime} from '$lib/game/core/chain-time';

/**
 * The hybrid policy on the client: the CHAIN is the answer and the clock is a
 * predictor.
 *
 * That ordering is the whole design, and it is the thing worth testing rather
 * than the arithmetic. Under a policy where unanimity can bring a phase
 * forward, an advance is a TRANSACTION, so no amount of local arithmetic can
 * see one - a client that trusted its own clock would keep showing a commit
 * phase that the chain had already closed, and let a player plan a turn that
 * can no longer be sent.
 */
const config: CycleConfig = {
	commitPhaseDuration: 30,
	revealPhaseDuration: 10,
	startTime: 0,
	commitTimeAllowance: 10.1,
	policy: 'hybrid',
};

/** A cycle on the nominal grid: cycle 2 runs 0..40, committing until 30. */
const nominal: CycleReading = {
	cycleNumber: 2,
	isCommitPhase: true,
	phaseStart: 0,
	phaseEnd: 30,
};

function fakeChainTime(initial: number): ChainTimeStore & {
	set(time: number): void;
	readonly listeners: number;
} {
	let listeners = 0;
	// Counted through the start/stop notifier rather than spied on, because what
	// is being asserted is that nobody is still LISTENING - which is not the
	// same question as whether anything still happens.
	const store = writable<SyncedTime>({value: initial}, () => {
		listeners++;
		return () => listeners--;
	});
	let current = initial;
	return {
		subscribe: store.subscribe,
		now: () => current,
		get listeners() {
			return listeners;
		},
		set(time: number) {
			current = time;
			store.set({value: time});
		},
	};
}

describe('predictCycle', () => {
	it('rolls a known cycle forward on the clock alone', () => {
		expect(predictCycle(nominal, 10, config)).toEqual(nominal);
		expect(predictCycle(nominal, 30, config)).toEqual({
			cycleNumber: 2,
			isCommitPhase: false,
			phaseStart: 30,
			phaseEnd: 40,
		});
		expect(predictCycle(nominal, 85, config)).toEqual({
			cycleNumber: 4,
			isCommitPhase: true,
			phaseStart: 80,
			phaseEnd: 110,
		});
		expect(predictCycle(nominal, 115, config)).toEqual({
			cycleNumber: 4,
			isCommitPhase: false,
			phaseStart: 110,
			phaseEnd: 120,
		});
	});

	it('predicts from the CYCLE it was given, not from the deployment', () => {
		// What an early cycle advance leaves behind: cycle 7 began at 1000,
		// which is nowhere on the grid the deployment's start time implies. An
		// arithmetic that ignored this would answer for a schedule the chain has
		// already left, and would be wrong about both the cycle and the phase.
		const reAnchored: CycleReading = {
			cycleNumber: 7,
			isCommitPhase: true,
			phaseStart: 1000,
			phaseEnd: 1030,
		};
		expect(predictCycle(reAnchored, 1035, config)).toEqual({
			cycleNumber: 7,
			isCommitPhase: false,
			phaseStart: 1030,
			phaseEnd: 1040,
		});
		expect(predictCycle(reAnchored, 1045, config)).toEqual({
			cycleNumber: 8,
			isCommitPhase: true,
			phaseStart: 1040,
			phaseEnd: 1070,
		});
	});

	it('leaves a cycle alone when the clock is behind it', () => {
		expect(predictCycle(nominal, -5, config)).toEqual(nominal);
	});
});

describe('timingsOf', () => {
	it('reports the reveal window an early open WIDENED, not the nominal one', () => {
		// The chain opened the reveal phase at 12 and the deadline did not move.
		const openedEarly: CycleReading = {
			cycleNumber: 2,
			isCommitPhase: false,
			phaseStart: 12,
			phaseEnd: 40,
		};
		const timings = timingsOf(openedEarly, 12, config);

		// 28 seconds, not the nominal 10. Reporting the nominal duration would
		// make the dial jump backwards the moment somebody advanced, and would
		// tell a player their reveal window closes eighteen seconds before it
		// does.
		expect(timings.currentPhaseDuration).toBe(28);
		expect(timings.timeLeftInPhase).toBe(28);
		expect(timings.revealOpensAt).toBe(12);
	});

	it('tells a scheduler the LATEST the reveal can open', () => {
		// From the commit phase, what a scheduler needs at commit time is the
		// moment the window is guaranteed to be open. An early advance can only
		// bring that forward, so a reveal aimed here always lands inside the
		// window - which is why early advance and scheduled reveals compose at
		// all.
		expect(timingsOf(nominal, 5, config).revealOpensAt).toBe(30);
	});
});

describe('the hybrid tracker', () => {
	function harness(readings: CycleReading[], startTime = 0) {
		const chainTime = fakeChainTime(startTime);
		let read = 0;
		const readCycle = vi.fn(
			async () => readings[Math.min(read++, readings.length - 1)],
		);
		const trackers = createHybridCycleTrackers({
			chainTime,
			config: staticCycleConfig(config),
			readCycle,
		});
		return {...trackers, chainTime, readCycle};
	}

	it('takes the chain over its own arithmetic when the chain is further on', async () => {
		// The clock says second 5 of the commit phase. The chain says the reveal
		// phase is already open, because everyone committed and someone pushed
		// it. THE CHAIN WINS: this is the case the whole policy exists for and
		// the one the arithmetic cannot produce.
		const {cycleInfo, refresh, chainTime} = harness([
			{cycleNumber: 2, isCommitPhase: false, phaseStart: 4, phaseEnd: 40},
		]);
		chainTime.set(5);
		await refresh();

		const info = get(cycleInfo) as HybridCycleInfo;
		expect(info.type).toBe('hybrid');
		expect(info.currentCycleNumber).toBe(2);
		expect(info.isCommitPhase).toBe(false);
	});

	it('carries on with the clock between reads', async () => {
		const {cycleInfo, refresh, chainTime} = harness([nominal]);
		await refresh();
		expect((get(cycleInfo) as HybridCycleInfo).isCommitPhase).toBe(true);

		// No new read, and the phase still turns over: polling alone would show
		// it up to a whole interval late, which on a ten-second reveal window is
		// a tenth of the time a player has to send it.
		chainTime.set(31);
		const info = cycleInfo.now() as HybridCycleInfo;
		expect(info.isCommitPhase).toBe(false);
		expect(info.currentCycleNumber).toBe(2);
	});

	it('never walks the cycle backwards when an answer arrives stale', async () => {
		// A load-balanced RPC can answer from a node a block behind. The chain
		// is monotone; the answers about it are not, and a cycle that went
		// backwards on screen would re-open a commit phase the chain has closed.
		const {cycleInfo, refresh, chainTime} = harness([
			{cycleNumber: 3, isCommitPhase: false, phaseStart: 70, phaseEnd: 80},
			{cycleNumber: 2, isCommitPhase: true, phaseStart: 0, phaseEnd: 30},
		]);
		chainTime.set(70);
		await refresh();
		expect((get(cycleInfo) as HybridCycleInfo).currentCycleNumber).toBe(3);

		await refresh();
		const info = get(cycleInfo) as HybridCycleInfo;
		expect(info.currentCycleNumber).toBe(3);
		expect(info.isCommitPhase).toBe(false);
	});

	it('answers from the deployment before anything has been read', async () => {
		// The first paint, before the first read lands. Degrading to the timed
		// answer is right because that IS the floor: the chain can only be
		// further on than the grid, never behind it.
		const {cycleInfo, chainTime} = harness([nominal]);
		chainTime.set(35);
		const info = cycleInfo.now() as HybridCycleInfo;
		expect(info.currentCycleNumber).toBe(2);
		expect(info.isCommitPhase).toBe(false);
	});

	it('stops reading and stops listening once nobody is subscribed', async () => {
		const {cycleInfo, readCycle, chainTime} = harness([nominal]);
		vi.useFakeTimers();
		try {
			const stop = cycleInfo.subscribe(() => {});
			expect(chainTime.listeners).toBe(1);
			stop();
			const readsAtStop = readCycle.mock.calls.length;

			// A leaked interval keeps an RPC call per second alive for the life
			// of the tab; a leaked CLOCK subscription keeps a dead closure alive
			// with it and is invisible to any behavioural assertion, because
			// after the stop it changes nothing anyone can observe. So the
			// listener is counted rather than its effects - the mutation that
			// deletes the unsubscribe passed the whole suite otherwise.
			expect(chainTime.listeners).toBe(0);
			vi.advanceTimersByTime(5000);
			chainTime.set(500);
			expect(readCycle.mock.calls.length).toBe(readsAtStop);

			// And it can be started again, because the canvas really does remount.
			const restart = cycleInfo.subscribe(() => {});
			expect(chainTime.listeners).toBe(1);
			restart();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('createCycleTrackers', () => {
	it('builds the tracker the DEPLOYMENT calls for, not the one the app prefers', async () => {
		// FOUND BY MUTATION: a dispatcher that always built the timed tracker
		// passed everything. It would leave a manual or hybrid deployment being
		// drawn from pure arithmetic - a countdown against a cycle nobody is
		// counting down, with the chain free to be somewhere else entirely, and
		// no error anywhere.
		const readCycle = vi.fn(async () => ({
			cycleNumber: 9,
			isCommitPhase: false,
			phaseStart: 400,
			phaseEnd: 440,
		}));

		function typeUnder(policy: CycleConfig['policy']) {
			const {cycleInfo} = createCycleTrackers({
				chainTime: fakeChainTime(0),
				config: staticCycleConfig({...config, policy}),
				readCycle,
			});
			return cycleInfo.now().type;
		}

		expect(typeUnder('timed')).toBe('timed');
		expect(typeUnder('manual')).toBe('manual');
		expect(typeUnder('hybrid')).toBe('hybrid');
	});
});

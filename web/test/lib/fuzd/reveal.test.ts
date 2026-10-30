import {describe, expect, it, vi} from 'vitest';
import {get, readable, writable} from 'svelte/store';
import {
	createScheduledReveal,
	fuzdSettings,
	revealModeFor,
	revealOnScheduleFailure,
	scheduledTurn,
	type FuzdExtensions,
	type FuzdSchedule,
	type FuzdStatus,
	type ScheduledReveal,
} from '$lib/fuzd';
import type {
	PersistedSubmission,
	SubmissionState,
	SubmissionStorage,
} from '$lib/game/core/submission';

const SCHEDULE: FuzdSchedule = {
	chainId: '31337',
	account: '0x00000000000000000000000000000000000000aa',
	remoteAccount: '0x00000000000000000000000000000000000000fe',
	slot: 'cycle_7',
	cycleNumber: 7,
	batchSize: 1,
	scheduledAt: 1,
	revealDueAt: 100,
	expiryDelta: 10,
	inClear: true,
};

type Turn = PersistedSubmission<number, FuzdExtensions>;

function storage(turns: Turn[]): SubmissionStorage<number, FuzdExtensions> {
	return {
		load: () => undefined,
		save: () => {},
		clear: () => {},
		committedTurns: (cycle) => turns.filter((t) => t.cycleNumber === cycle),
	};
}

const committedTurn: Turn = {
	cycleNumber: 7,
	actions: [1],
	secret: '0x01',
	committed: true,
	revealScheduled: true,
	extensions: {fuzd: SCHEDULE},
};

describe('whether to schedule, and how the browser reveals (R2, P7)', () => {
	const chain = {id: 31337, properties: {expectedWorstGasPrice: '1000000000'}};

	it('schedules with a URI, a chain price, and a chain outside the tab', () => {
		expect(fuzdSettings({uri: '//:34002', chain, embedded: false})).toEqual({
			uri: '//:34002',
			chainId: 31337,
			maxFeePerGasAuthorized: 1_000_000_000n,
		});
	});

	it('schedules nothing without a URI, in an embedded chain, or without a price', () => {
		expect(fuzdSettings({uri: '', chain, embedded: false})).toBeUndefined();
		expect(
			fuzdSettings({uri: undefined, chain, embedded: false}),
		).toBeUndefined();
		expect(
			fuzdSettings({uri: '//:34002', chain, embedded: true}),
		).toBeUndefined();
		expect(
			fuzdSettings({
				uri: '//:34002',
				chain: {id: 1, properties: {}},
				embedded: false,
			}),
		).toBeUndefined();
		expect(
			fuzdSettings({uri: '//:34002', chain: {id: 1}, embedded: false}),
		).toBeUndefined();
	});

	it('falls back at half the phase with a scheduler, and reveals at once without', () => {
		expect(revealModeFor(true)).toEqual({
			autoReveal: 'fallback',
			fallbackRevealAfter: 0.5,
		});
		expect(revealModeFor(false)).toEqual({autoReveal: 'immediately'});
	});
});

describe('the scheduled turn, read from what was stored with it', () => {
	function turnFor(state: SubmissionState<number>, turns: Turn[]) {
		return get(
			scheduledTurn({
				identity: readable('0xplayer'),
				submission: readable(state),
				storageFor: () => storage(turns),
			}),
		);
	}

	it('finds the schedule a committed turn carries, by its cycle', () => {
		expect(
			turnFor(
				{
					step: 'Committed',
					cycleNumber: 7,
					actions: [1],
					revealScheduled: true,
				},
				[committedTurn],
			),
		).toEqual({cycleNumber: 7, revealScheduled: true, schedule: SCHEDULE});
		// After a reload, revealed by somebody else: the record still says so.
		expect(
			turnFor({step: 'Revealed', cycleNumber: 7}, [committedTurn]),
		).toEqual({
			cycleNumber: 7,
			revealScheduled: true,
			schedule: SCHEDULE,
		});
	});

	it('says not scheduled when scheduling failed', () => {
		expect(
			turnFor(
				{
					step: 'Committed',
					cycleNumber: 8,
					actions: [1],
					revealScheduled: false,
				},
				[
					{
						...committedTurn,
						cycleNumber: 8,
						revealScheduled: false,
						extensions: {},
					},
				],
			),
		).toEqual({cycleNumber: 8, revealScheduled: false});
	});

	it('has nothing to say without a committed turn', () => {
		expect(turnFor({step: 'Idle'}, [committedTurn])).toBeUndefined();
		expect(
			turnFor({step: 'Planning', cycleNumber: 7, actions: [1]}, [
				committedTurn,
			]),
		).toBeUndefined();
	});
});

describe("fuzd's status, polled only in the reveal phase of the turn's cycle", () => {
	it('is asked in the reveal phase, not in the commit phase or another cycle', async () => {
		const read = vi.fn(async (): Promise<FuzdStatus> => ({step: 'scheduled'}));
		const turn = writable<ScheduledReveal | undefined>({
			cycleNumber: 7,
			revealScheduled: true,
			schedule: SCHEDULE,
		});
		const info = writable({currentCycleNumber: 7, isCommitPhase: true});
		const reveal = createScheduledReveal({
			turn,
			cycleInfo: info,
			endpoint: () => 'http://fuzd.test',
			read,
		});
		const stop = reveal.subscribe(() => {});
		await Promise.resolve();
		expect(read).not.toHaveBeenCalled();

		info.set({currentCycleNumber: 7, isCommitPhase: false});
		await vi.waitFor(() =>
			expect(get(reveal)?.status).toEqual({step: 'scheduled'}),
		);

		read.mockClear();
		info.set({currentCycleNumber: 8, isCommitPhase: true});
		await Promise.resolve();
		expect(get(reveal)?.status).toEqual({step: 'scheduled'});
		stop();
	});
});

describe('a failure reported by fuzd (P7)', () => {
	function submissionOf(state: SubmissionState<number>) {
		const store = writable(state);
		const reveal = vi.fn(async () => {});
		return {store, reveal, submission: {subscribe: store.subscribe, reveal}};
	}

	it('makes this browser reveal at once, once, while the turn is still committed', () => {
		const s = submissionOf({
			step: 'Committed',
			cycleNumber: 7,
			actions: [1],
			revealScheduled: true,
		});
		const view = writable<ScheduledReveal | undefined>({
			cycleNumber: 7,
			schedule: SCHEDULE,
			status: {step: 'scheduled'},
		});
		const stop = revealOnScheduleFailure({
			reveal: view,
			submission: s.submission,
		});
		expect(s.reveal).not.toHaveBeenCalled();

		view.set({
			cycleNumber: 7,
			schedule: SCHEDULE,
			status: {step: 'failed', reason: 'x'},
		});
		expect(s.reveal).toHaveBeenCalledTimes(1);
		view.set({
			cycleNumber: 7,
			schedule: SCHEDULE,
			status: {step: 'failed', reason: 'y'},
		});
		expect(s.reveal).toHaveBeenCalledTimes(1);
		stop();
	});

	it('does nothing when fuzd is merely unreachable, or the turn is already open', () => {
		const s = submissionOf({
			step: 'Committed',
			cycleNumber: 7,
			actions: [1],
			revealScheduled: true,
		});
		const view = writable<ScheduledReveal | undefined>({
			cycleNumber: 7,
			schedule: SCHEDULE,
			status: {step: 'unreachable'},
		});
		const stop = revealOnScheduleFailure({
			reveal: view,
			submission: s.submission,
		});
		s.store.set({step: 'Revealed', cycleNumber: 7});
		view.set({
			cycleNumber: 7,
			schedule: SCHEDULE,
			status: {step: 'failed', reason: 'x'},
		});
		expect(s.reveal).not.toHaveBeenCalled();
		stop();
	});
});

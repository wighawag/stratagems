import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import {
	createFuzdStatus,
	readFuzdStatus,
	type FuzdSchedule,
	type FuzdStatus,
} from '$lib/fuzd';

/**
 * The status reader against a fake fuzd: the two routes it reads, answered as
 * fuzd 0.12 answers them (measured against the published CLI on a local
 * chain, 2026-10-30: see the done task).
 */
const SCHEDULE: FuzdSchedule = {
	chainId: '31337',
	account: '0x00000000000000000000000000000000000000aa',
	remoteAccount: '0x00000000000000000000000000000000000000fe',
	slot: 'cycle_7',
	cycleNumber: 7,
	batchSize: 2,
	scheduledAt: 1,
	revealDueAt: 100,
	expiryDelta: 10,
	inClear: true,
};

type Execution = {
	hash?: string;
	finalized?: boolean;
	isVoidTransaction?: boolean;
	lastError?: string;
};

function fakeFuzd(state: {
	queued?: {broadcasted: boolean; finalized: boolean};
	executions?: (Execution | undefined)[];
	down?: boolean;
}) {
	const asked: string[] = [];
	const fetch = async (url: string) => {
		asked.push(url);
		if (state.down) throw new TypeError('fetch failed');
		const base = 'http://fuzd.test';
		const id = `${SCHEDULE.chainId}/${SCHEDULE.account}/${SCHEDULE.slot}`;
		let execution: unknown;
		if (url === `${base}/api/scheduling/scheduledExecution/${id}`) {
			execution = state.queued;
		} else if (url.startsWith(`${base}/api/execution/execution/${id}/`)) {
			execution = state.executions?.[Number(url.split('/').pop())];
		} else {
			return {ok: false, json: async () => ({})};
		}
		return {ok: true, json: async () => ({success: true, execution})};
	};
	return {fetch, asked};
}

async function statusOf(state: Parameters<typeof fakeFuzd>[0]) {
	return readFuzdStatus({
		endpoint: 'http://fuzd.test/',
		schedule: SCHEDULE,
		fetch: fakeFuzd(state).fetch,
	});
}

describe('reading what fuzd says about a schedule', () => {
	it('asks both routes, keyed by the signing account and the slot, for every transaction', async () => {
		const fuzd = fakeFuzd({queued: {broadcasted: false, finalized: false}});
		await readFuzdStatus({
			endpoint: 'http://fuzd.test',
			schedule: SCHEDULE,
			fetch: fuzd.fetch,
		});
		expect(fuzd.asked.sort()).toEqual([
			'http://fuzd.test/api/execution/execution/31337/0x00000000000000000000000000000000000000aa/cycle_7/0',
			'http://fuzd.test/api/execution/execution/31337/0x00000000000000000000000000000000000000aa/cycle_7/1',
			'http://fuzd.test/api/scheduling/scheduledExecution/31337/0x00000000000000000000000000000000000000aa/cycle_7',
		]);
	});

	it('is scheduled while fuzd holds it and nothing is broadcast', async () => {
		expect(
			await statusOf({queued: {broadcasted: false, finalized: false}}),
		).toEqual({
			step: 'scheduled',
		});
	});

	it('is broadcast, with how much of the batch, once fuzd has sent some', async () => {
		expect(
			await statusOf({
				queued: {broadcasted: true, finalized: false},
				executions: [{hash: '0x1', finalized: false}],
			}),
		).toEqual({step: 'broadcast', sent: 1, total: 2});
	});

	it('is confirmed once every transaction is final with no error', async () => {
		expect(
			await statusOf({
				queued: {broadcasted: true, finalized: true},
				executions: [
					{hash: '0x1', finalized: true},
					{hash: '0x2', finalized: true},
				],
			}),
		).toEqual({step: 'confirmed'});
	});

	it('is failed when a transaction failed, was replaced or voided', async () => {
		for (const failure of [
			{lastError: 'FAILED'},
			{lastError: 'REPLACED'},
			{isVoidTransaction: true},
		]) {
			const status = await statusOf({
				queued: {broadcasted: true, finalized: true},
				executions: [
					{hash: '0x1', finalized: true, ...failure},
					{hash: '0x2', finalized: true},
				],
			});
			expect(status.step).toBe('failed');
		}
	});

	it('is failed when fuzd no longer holds the schedule at all', async () => {
		expect((await statusOf({})).step).toBe('failed');
	});

	it('is unreachable, NOT failed, when fuzd cannot be asked', async () => {
		expect(await statusOf({down: true})).toEqual({step: 'unreachable'});
	});
});

describe('polling it in the reveal phase', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('polls only while active, until final, and keeps the last reading', async () => {
		const answers: FuzdStatus[] = [
			{step: 'scheduled'},
			{step: 'broadcast', sent: 1, total: 2},
			{step: 'confirmed'},
		];
		const read = vi.fn(
			async () => answers.shift() ?? {step: 'confirmed' as const},
		);
		const schedule = writable<FuzdSchedule | undefined>(SCHEDULE);
		const active = writable(false);
		const status = createFuzdStatus({
			endpoint: () => 'http://fuzd.test',
			schedule,
			active,
			intervalMs: 1000,
			read,
		});
		const seen: (FuzdStatus | undefined)[] = [];
		const stop = status.subscribe((s) => seen.push(s));

		await vi.advanceTimersByTimeAsync(5000);
		expect(read).not.toHaveBeenCalled();

		active.set(true);
		await vi.advanceTimersByTimeAsync(0);
		expect(get(status)).toEqual({step: 'scheduled'});
		await vi.advanceTimersByTimeAsync(1000);
		expect(get(status)).toEqual({step: 'broadcast', sent: 1, total: 2});
		await vi.advanceTimersByTimeAsync(1000);
		expect(get(status)).toEqual({step: 'confirmed'});
		await vi.advanceTimersByTimeAsync(10_000);
		expect(read).toHaveBeenCalledTimes(3);

		// The phase is over: the reading stays.
		active.set(false);
		expect(get(status)).toEqual({step: 'confirmed'});
		stop();
		expect(seen[0]).toBeUndefined();
	});

	it('starts over for a different schedule, and stops when inactive', async () => {
		const read = vi.fn(async () => ({step: 'scheduled' as const}));
		const schedule = writable<FuzdSchedule | undefined>(SCHEDULE);
		const active = writable(true);
		const status = createFuzdStatus({
			endpoint: () => 'http://fuzd.test',
			schedule,
			active,
			intervalMs: 1000,
			read,
		});
		const stop = status.subscribe(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(read).toHaveBeenCalledTimes(1);

		schedule.set({...SCHEDULE, slot: 'cycle_8'});
		expect(get(status)).toBeUndefined();
		await vi.advanceTimersByTimeAsync(0);
		expect(read).toHaveBeenLastCalledWith(
			expect.objectContaining({
				schedule: expect.objectContaining({slot: 'cycle_8'}),
			}),
		);

		active.set(false);
		const calls = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(read).toHaveBeenCalledTimes(calls);
		stop();
	});
});

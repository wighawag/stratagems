import {describe, expect, it} from 'vitest';
import {logRangeStart, MIN_LOG_BLOCKS} from '$lib/onchain/state';

/**
 * How far back a reader's logs reach, which is sized in SECONDS and so has to
 * survive the chains where seconds measure nothing. Both cases below were
 * found by bomber-world's offline bomb e2e on 2026-09-26: a bomb is the first
 * thing on any board that only a reveal log can place.
 */
describe('the block range a reader is handed for its logs', () => {
	it('is four cycles of blocks on an ordinary timed chain', () => {
		// 40 s cycles at 0.1 s blocks: 1600 blocks, well above the floor.
		expect(
			logRangeStart({
				toBlock: 10_000,
				cycleDuration: 40,
				averageBlockTime: 0.1,
			}),
		).toBe(10_000 - 1600);
	});

	it('never shrinks below one request of blocks', () => {
		// A MANUAL cycle has zero durations, so four cycles of seconds is zero
		// blocks, and the range used to be the latest block alone.
		expect(
			logRangeStart({toBlock: 5000, cycleDuration: 0, averageBlockTime: 1}),
		).toBe(5000 - (MIN_LOG_BLOCKS - 1));
		// and a slow timed chain the same way
		expect(
			logRangeStart({toBlock: 5000, cycleDuration: 40, averageBlockTime: 2}),
		).toBe(5000 - (MIN_LOG_BLOCKS - 1));
	});

	it('is a number when the block time is zero', () => {
		// Blocks sharing a timestamp make the measured block time zero, and 0/0
		// is NaN. A NaN start used to make a chunking reader send no request at
		// all, silently, and only on the runs where the sampled blocks shared a
		// timestamp.
		const start = logRangeStart({
			toBlock: 40,
			cycleDuration: 0,
			averageBlockTime: 0,
		});
		expect(Number.isFinite(start)).toBe(true);
		expect(start).toBe(0);
		expect(
			logRangeStart({toBlock: 5000, cycleDuration: 40, averageBlockTime: 0}),
		).toBe(5000 - (MIN_LOG_BLOCKS - 1));
	});

	it('never starts before genesis', () => {
		expect(
			logRangeStart({toBlock: 10, cycleDuration: 40, averageBlockTime: 1}),
		).toBe(0);
	});
});

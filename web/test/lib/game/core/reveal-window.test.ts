import {describe, expect, it} from 'vitest';
import {
	MAX_RECEIPT_POLL_MS,
	MIN_RECEIPT_POLL_MS,
	actionsOpenableInRevealPhase,
	chunksOpenableInRevealPhase,
	receiptPollingInterval,
} from '$lib/game/core/reveal-window';

describe('receiptPollingInterval', () => {
	it('sizes the poll from the phase rather than from an absolute idea of fast', () => {
		// A twentieth of the window: the same client has to be right for a
		// ten-second reveal phase and for the one-hour one two games in this
		// lineage run.
		expect(receiptPollingInterval(10)).toBe(500);
		expect(receiptPollingInterval(60)).toBe(3_000);
	});

	it('never polls harder than the floor, because every poll is a request', () => {
		expect(receiptPollingInterval(1)).toBe(MIN_RECEIPT_POLL_MS);
		expect(receiptPollingInterval(0.1)).toBe(MIN_RECEIPT_POLL_MS);
	});

	it('leaves a long cycle exactly as it was before this existed', () => {
		// viem's own default. A 23h/1h split must not start polling faster
		// because this file arrived.
		expect(receiptPollingInterval(3_600)).toBe(MAX_RECEIPT_POLL_MS);
	});

	it('answers for a deployment that declares nothing usable', () => {
		expect(receiptPollingInterval(0)).toBe(MAX_RECEIPT_POLL_MS);
		expect(receiptPollingInterval(Number.NaN)).toBe(MAX_RECEIPT_POLL_MS);
	});
});

describe('chunksOpenableInRevealPhase', () => {
	/**
	 * THE TWO ROWS THAT WERE MEASURED, against a local node mining on a 1s
	 * interval with a 10s reveal phase. The client's own poll interval decides
	 * which term dominates, and the measurement is what this model is fitted to:
	 * 3 chunks landed at a 4000ms poll and 9 at a 100ms one.
	 */
	it('matches what was measured at the shipped 4000ms default', () => {
		// Conservative against the measured 3, which is the safe direction.
		expect(
			chunksOpenableInRevealPhase({
				revealPhaseDuration: 10,
				averageBlockTime: 1,
				pollingInterval: 4_000,
			}),
		).toBe(1);
	});

	it('matches what was measured once the client stops being the bottleneck', () => {
		expect(
			chunksOpenableInRevealPhase({
				revealPhaseDuration: 10,
				averageBlockTime: 1,
				pollingInterval: 500,
			}),
		).toBe(9);
	});

	it('is bounded by the block time once polling is fast enough', () => {
		// Polling faster than the chain produces blocks buys nothing.
		const fast = chunksOpenableInRevealPhase({
			revealPhaseDuration: 10,
			averageBlockTime: 1,
			pollingInterval: 100,
		});
		const faster = chunksOpenableInRevealPhase({
			revealPhaseDuration: 10,
			averageBlockTime: 1,
			pollingInterval: 10,
		});
		expect(fast).toBe(9);
		expect(faster).toBe(fast);
	});

	it('scales with the window, which is what a long cycle buys', () => {
		expect(
			chunksOpenableInRevealPhase({
				revealPhaseDuration: 3_600,
				averageBlockTime: 12,
				pollingInterval: 4_000,
			}),
		).toBe(299);
	});

	it('never answers zero, because one chunk is one transaction', () => {
		// A reveal phase shorter than a block is a broken deployment, and the
		// remedy is not to refuse the player every move they could make.
		expect(
			chunksOpenableInRevealPhase({
				revealPhaseDuration: 1,
				averageBlockTime: 12,
				pollingInterval: 4_000,
			}),
		).toBe(1);
	});

	it('bounds NOTHING when the cycle has no clock', () => {
		// THE MANUAL POLICY, where this would otherwise be at its most wrong. Its
		// phases have no durations, because the cycle moves when everyone has
		// acted rather than when a timer expires - so a reveal is racing nothing
		// and a turn of any length can be opened. Reading that zero as a deadline
		// would impose the tightest possible limit exactly where there is no
		// reason for one.
		expect(
			chunksOpenableInRevealPhase({
				revealPhaseDuration: 0,
				averageBlockTime: 1,
				pollingInterval: 500,
			}),
		).toBeUndefined();
	});

	it('bounds nothing while the chain clock has not measured a block time', () => {
		expect(
			chunksOpenableInRevealPhase({
				revealPhaseDuration: 10,
				averageBlockTime: 0,
				pollingInterval: 500,
			}),
		).toBeUndefined();
	});
});

describe('actionsOpenableInRevealPhase', () => {
	it('answers in the unit the player plans in', () => {
		// 9 chunks of 4 actions. The chunk is a deployment parameter, so it is
		// taken rather than assumed.
		expect(
			actionsOpenableInRevealPhase({
				revealPhaseDuration: 10,
				averageBlockTime: 1,
				pollingInterval: 500,
				actionsPerReveal: 4,
			}),
		).toBe(36);
	});

	it('follows the deployment when the chunk changes', () => {
		// Raising `actionsPerReveal` is the other lever on the same problem, and
		// this is the half of it that is free: the client follows without code.
		expect(
			actionsOpenableInRevealPhase({
				revealPhaseDuration: 10,
				averageBlockTime: 1,
				pollingInterval: 500,
				actionsPerReveal: 16,
			}),
		).toBe(144);
	});

	it('stays unbounded rather than multiplying an absent limit', () => {
		expect(
			actionsOpenableInRevealPhase({
				revealPhaseDuration: 0,
				averageBlockTime: 1,
				pollingInterval: 500,
				actionsPerReveal: 4,
			}),
		).toBeUndefined();
	});

	it('refuses to multiply by a chunk nobody could reveal', () => {
		for (const actionsPerReveal of [0, -1, 1.5, Number.NaN]) {
			expect(
				actionsOpenableInRevealPhase({
					revealPhaseDuration: 10,
					averageBlockTime: 1,
					pollingInterval: 500,
					actionsPerReveal,
				}),
			).toBe(1);
		}
	});
});

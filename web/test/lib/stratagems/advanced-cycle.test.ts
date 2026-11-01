/**
 * THE BOARD'S STAMP AT A TABLE (step L2, PL2-6 of
 * work/plans/join-template-commit-reveal.md): the processor folds only a
 * RE-ANCHORING `CycleAdvanced` (`commiting` true), with its block's timestamp,
 * and the framework's stamp counts whole cycles from it under
 * `TimedWithEarlyAdvance`, reads it as the cycle under Manual, and ignores it
 * under Timed.
 */
import {describe, expect, it} from 'vitest';
import {stratagemsProcessor} from 'stratagems-indexer';
import {stampedCycleNumber} from '$lib/indexer/cycle-stamp';
import type {CycleConfig} from '$lib/game/core/cycle';

type Row = {cycleNumber: number; anchoredAt: number};

/** The processor's `state`, as far as `onCycleAdvanced` writes it. */
function fold(events: {cycleNumber: bigint; commiting: boolean; blockTimestamp: number}[]): Row | undefined {
	let row: Row | undefined;
	const state = {
		set(entity: string, _id: unknown, value: Row) {
			if (entity !== 'advancedCycle') throw new Error(`unexpected ${entity}`);
			row = value;
		},
	};
	const handler = (stratagemsProcessor as unknown as Record<string, (s: unknown, e: unknown) => void>)
		.onCycleAdvanced;
	for (const event of events) {
		handler(state, {
			args: {cycleNumber: event.cycleNumber, commiting: event.commiting, pushedBy: '0x00'},
			blockNumber: 1,
			blockTimestamp: event.blockTimestamp,
		});
	}
	return row;
}

const START = 1_735_689_600;
const hybrid = {
	policy: 'hybrid',
	startTime: START,
	commitPhaseDuration: 45,
	revealPhaseDuration: 15,
} as unknown as CycleConfig;
const manual = {policy: 'manual', startTime: 0, commitPhaseDuration: 0, revealPhaseDuration: 0} as unknown as CycleConfig;

describe("the board's stamp from the folded anchor", () => {
	it("folds a table's start, and counts whole cycles of the clock from its block", () => {
		const row = fold([{cycleNumber: 1000n, commiting: true, blockTimestamp: START + 100_000}]);
		expect(row).toEqual({cycleNumber: 1000, anchoredAt: START + 100_000});
		expect(stampedCycleNumber(hybrid, row, START + 100_000)).toBe(1000);
		expect(stampedCycleNumber(hybrid, row, START + 100_059)).toBe(1000);
		expect(stampedCycleNumber(hybrid, row, START + 100_060)).toBe(1001);
		expect(stampedCycleNumber(hybrid, row, START + 100_200)).toBe(1003);
	});

	it('moves nothing on an early reveal, which keeps its cycle number', () => {
		const anchored = fold([{cycleNumber: 1000n, commiting: true, blockTimestamp: START + 100_000}]);
		const afterEarlyReveal = fold([
			{cycleNumber: 1000n, commiting: true, blockTimestamp: START + 100_000},
			{cycleNumber: 1000n, commiting: false, blockTimestamp: START + 100_010},
		]);
		expect(afterEarlyReveal).toEqual(anchored);
		expect(fold([{cycleNumber: 7n, commiting: false, blockTimestamp: START}])).toBeUndefined();
	});

	it('re-anchors on an early close, from which the clock carries on', () => {
		const row = fold([
			{cycleNumber: 1000n, commiting: true, blockTimestamp: START + 100_000},
			{cycleNumber: 1000n, commiting: false, blockTimestamp: START + 100_010},
			{cycleNumber: 1001n, commiting: true, blockTimestamp: START + 100_020},
		]);
		expect(row).toEqual({cycleNumber: 1001, anchoredAt: START + 100_020});
		expect(stampedCycleNumber(hybrid, row, START + 100_079)).toBe(1001);
		expect(stampedCycleNumber(hybrid, row, START + 100_080)).toBe(1002);
	});

	it("reads an offline world's Manual stamp as before: the last re-anchoring push's cycle", () => {
		const row = fold([
			{cycleNumber: 2n, commiting: false, blockTimestamp: 10},
			{cycleNumber: 3n, commiting: true, blockTimestamp: 20},
			{cycleNumber: 3n, commiting: false, blockTimestamp: 30},
		]);
		expect(stampedCycleNumber(manual, row)).toBe(3);
		expect(stampedCycleNumber(manual, undefined)).toBe(2);
	});
});

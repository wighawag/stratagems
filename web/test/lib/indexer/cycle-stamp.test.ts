import {describe, expect, it} from 'vitest';
import {
	FIRST_CYCLE_NUMBER,
	stampedCycleNumber,
	stampNeedsTimestamp,
} from '$lib/indexer/cycle-stamp';
import type {CycleConfig} from '$lib/game/core/cycle';

const timed: CycleConfig = {
	commitPhaseDuration: 30,
	revealPhaseDuration: 10,
	startTime: 1000,
	commitTimeAllowance: 0,
	policy: 'timed',
};
// the offline world's deploy: Manual, both durations zero
const manual: CycleConfig = {
	commitPhaseDuration: 0,
	revealPhaseDuration: 0,
	startTime: 0,
	commitTimeAllowance: 0,
	policy: 'manual',
};

describe("an indexed state's cycle stamp", () => {
	it('timed: from the block timestamp, cycles counted from 2', () => {
		expect(stampNeedsTimestamp(timed)).toBe(true);
		expect(stampedCycleNumber(timed, undefined, 1000)).toBe(2);
		expect(stampedCycleNumber(timed, undefined, 1039)).toBe(2);
		expect(stampedCycleNumber(timed, undefined, 1040)).toBe(3);
		// a pushed cycle in the state does not override the clock
		expect(stampedCycleNumber(timed, {cycleNumber: 9}, 1040)).toBe(3);
	});

	it('timed: refuses to stamp without the timestamp', () => {
		expect(() => stampedCycleNumber(timed, undefined)).toThrow(/timestamp/);
	});

	it('manual: the first cycle until something is pushed, and needs no timestamp', () => {
		expect(stampNeedsTimestamp(manual)).toBe(false);
		expect(stampedCycleNumber(manual, undefined)).toBe(FIRST_CYCLE_NUMBER);
		expect(FIRST_CYCLE_NUMBER).toBe(2);
	});

	it('manual: the cycle the last push left, in either phase, whatever the clock says', () => {
		expect(stampedCycleNumber(manual, {cycleNumber: 2})).toBe(2);
		expect(stampedCycleNumber(manual, {cycleNumber: 7}, 123456)).toBe(7);
		// the anchor's time is the hybrid policy's, never read here
		expect(
			stampedCycleNumber(manual, {cycleNumber: 7, anchoredAt: 5}, 123456),
		).toBe(7);
		// never the arithmetic, which would divide by the zero durations
		expect(Number.isFinite(stampedCycleNumber(manual, undefined, 99))).toBe(
			true,
		);
	});

	const hybrid: CycleConfig = {...timed, policy: 'hybrid'};

	it('hybrid: needs the timestamp, and before any push reads the clock as timed', () => {
		expect(stampNeedsTimestamp(hybrid)).toBe(true);
		expect(() => stampedCycleNumber(hybrid, undefined)).toThrow(/timestamp/);
		expect(stampedCycleNumber(hybrid, undefined, 1000)).toBe(2);
		expect(stampedCycleNumber(hybrid, undefined, 1085)).toBe(4);
	});

	it("hybrid: the anchor's cycle plus the whole cycles elapsed since its block", () => {
		// a table started (or closed early) at 1017, opening cycle 9
		const anchor = {cycleNumber: 9, anchoredAt: 1017};
		expect(stampedCycleNumber(hybrid, anchor, 1017)).toBe(9);
		// still cycle 9 through its reveal phase, which is not on the grid
		expect(stampedCycleNumber(hybrid, anchor, 1056)).toBe(9);
		// the clock carries on from the anchor: one, then two cycles later
		expect(stampedCycleNumber(hybrid, anchor, 1057)).toBe(10);
		expect(stampedCycleNumber(hybrid, anchor, 1097)).toBe(11);
		// never the deployment's grid once anchored
		expect(stampedCycleNumber(hybrid, anchor, 1040)).toBe(9);
	});

	it("hybrid: refuses an anchor without its block's time", () => {
		expect(() => stampedCycleNumber(hybrid, {cycleNumber: 9}, 1040)).toThrow(
			/anchor's block timestamp/,
		);
	});
});

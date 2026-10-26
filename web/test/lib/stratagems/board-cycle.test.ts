import {describe, expect, it} from 'vitest';
import {
	assertStampable,
	boardCycleNumber,
	FIRST_CYCLE_NUMBER,
	stampNeedsTimestamp,
	UnstampableCyclePolicyError,
} from '$lib/stratagems/board/board-cycle';
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

describe("the board's cycle stamp", () => {
	it('timed: from the block timestamp, cycles counted from 2', () => {
		expect(stampNeedsTimestamp(timed)).toBe(true);
		expect(boardCycleNumber(timed, {}, 1000)).toBe(2);
		expect(boardCycleNumber(timed, {}, 1039)).toBe(2);
		expect(boardCycleNumber(timed, {}, 1040)).toBe(3);
		// a pushed cycle in the state does not override the clock
		expect(
			boardCycleNumber(
				timed,
				{advancedCycle: {cycleNumber: 9, commiting: true}},
				1040,
			),
		).toBe(3);
	});

	it('timed: refuses to stamp without the timestamp', () => {
		expect(() => boardCycleNumber(timed, {})).toThrow(/timestamp/);
	});

	it('manual: the first cycle until something is pushed, and needs no timestamp', () => {
		expect(stampNeedsTimestamp(manual)).toBe(false);
		expect(boardCycleNumber(manual, {})).toBe(FIRST_CYCLE_NUMBER);
		expect(FIRST_CYCLE_NUMBER).toBe(2);
	});

	it('manual: the cycle the last push left, in either phase, whatever the clock says', () => {
		expect(
			boardCycleNumber(manual, {
				advancedCycle: {cycleNumber: 2, commiting: false},
			}),
		).toBe(2);
		expect(
			boardCycleNumber(
				manual,
				{advancedCycle: {cycleNumber: 7, commiting: true}},
				123456,
			),
		).toBe(7);
		// never the arithmetic, which would divide by the zero durations
		expect(Number.isFinite(boardCycleNumber(manual, {}, 99))).toBe(true);
	});

	it('hybrid: refused with a named error, when the board is made', () => {
		const hybrid: CycleConfig = {...timed, policy: 'hybrid'};
		expect(() => assertStampable(hybrid)).toThrow(UnstampableCyclePolicyError);
		expect(() => boardCycleNumber(hybrid, {}, 1000)).toThrow(
			UnstampableCyclePolicyError,
		);
		expect(() => assertStampable(timed)).not.toThrow();
		expect(() => assertStampable(manual)).not.toThrow();
	});
});

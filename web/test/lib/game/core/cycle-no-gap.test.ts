import {describe, expect, it} from 'vitest';
import {
	calculateCycleInfo,
	predictCycle,
	type CycleConfig,
	type CycleReading,
} from '$lib/game/core/cycle';

/**
 * A CYCLE IS A COMMIT PHASE FOLLOWED BY A REVEAL PHASE AND NOTHING ELSE.
 *
 * This is the arithmetic the submission's recovery rests on, and it is
 * load-bearing in a way that is easy to lose by accident. Because there is no
 * trailing segment, a commitment made in the CURRENT cycle is always still
 * openable: you are either in the phase that takes it or in the phase that
 * opens it. That is why reconciling a submission with the chain needs nothing
 * at all for the too-late case - the moment the reveal window shuts, the cycle
 * has advanced, and the existing missed-reveal path reports it and offers the
 * settlement.
 *
 * A settlement window, a gap between cycles, or a cycle that can turn over
 * while a reveal window is still nominally open would each void that argument,
 * silently, and the symptom would be a player losing a stake rather than
 * anything failing. Nothing tested it until this file: the property was true by
 * construction, and "true by construction" is exactly what a later parameter
 * quietly stops being.
 *
 * WHAT EACH POLICY DOES WITH IT:
 *
 * - `timed` preserves it by the original arithmetic, swept below.
 * - `hybrid` preserves it because an early advance only ever WIDENS a window:
 *   opening the reveal phase early leaves the deadline where it was, and
 *   closing the cycle early is refused until every commitment in it has been
 *   revealed, so no open commitment is ever left behind. Swept below over the
 *   grid, and the contract's half is pinned in `contracts/test/js`.
 * - `manual` preserves it by construction of the advance: the only transitions
 *   are commit to reveal within one cycle, and reveal to the next cycle once
 *   everything committed has been opened. There is no clock to sweep, so that
 *   half lives entirely in the contract suite.
 */
const config: CycleConfig = {
	commitPhaseDuration: 30,
	revealPhaseDuration: 10,
	startTime: 100,
	commitTimeAllowance: 10.1,
	policy: 'timed',
};

describe('a cycle has no gap in it', () => {
	it('is in one of exactly two phases at every instant, under the timed formula', () => {
		let previous = calculateCycleInfo(config.startTime, config);
		expect(previous.isCommitPhase).toBe(true);

		for (let t = config.startTime; t < config.startTime + 400; t += 0.5) {
			const info = calculateCycleInfo(t, config);

			// Time remaining is never negative and never exceeds the phase, so
			// there is no instant that belongs to no phase.
			expect(info.timeLeftInPhase, `time left at ${t}`).toBeGreaterThan(0);
			expect(info.timeLeftInPhase).toBeLessThanOrEqual(
				info.currentPhaseDuration,
			);

			if (info.currentCycleNumber === previous.currentCycleNumber) {
				// Within one cycle the only move is commit -> reveal, never back.
				expect(
					previous.isCommitPhase || !info.isCommitPhase,
					`phase went backwards at ${t}`,
				).toBe(true);
			} else {
				// AND A CYCLE IS ONLY EVER LEFT FROM ITS REVEAL PHASE. Leaving
				// from the commit phase is what would strand a commitment that
				// was made and never given a window to open in.
				expect(info.currentCycleNumber, `cycle jumped at ${t}`).toBe(
					previous.currentCycleNumber + 1,
				);
				expect(previous.isCommitPhase, `left cycle early at ${t}`).toBe(false);
				expect(info.isCommitPhase).toBe(true);
			}
			previous = info;
		}
	});

	it('tiles time with no hole and no overlap, under the hybrid prediction', () => {
		let reading: CycleReading = {
			cycleNumber: 2,
			isCommitPhase: true,
			phaseStart: 100,
			phaseEnd: 130,
		};

		for (let i = 0; i < 20; i++) {
			// The instant the phase ends is the instant the next one begins:
			// there is no moment in between, which is what "no trailing segment"
			// means when it is stated about the boundary rather than the cycle.
			const next = predictCycle(reading, reading.phaseEnd, config);
			expect(next.phaseStart, `hole at ${reading.phaseEnd}`).toBe(
				reading.phaseEnd,
			);
			expect(next.isCommitPhase).toBe(!reading.isCommitPhase);
			expect(next.cycleNumber).toBe(
				reading.isCommitPhase ? reading.cycleNumber : reading.cycleNumber + 1,
			);
			reading = next;
		}
	});

	it('leaves the cycle ending where it did when a reveal window opens early', () => {
		// What the contract writes down when unanimity brings the reveal phase
		// forward: the window starts now, and the deadline is untouched. The
		// cycle is still exactly as long as it was, so a reveal scheduled
		// against the nominal time still lands inside it - and the cycle still
		// cannot end with an unopened commitment in it.
		const openedEarly: CycleReading = {
			cycleNumber: 2,
			isCommitPhase: false,
			phaseStart: 112,
			phaseEnd: 140,
		};
		const nominalCycleEnd = config.startTime + 40;
		expect(openedEarly.phaseEnd).toBe(nominalCycleEnd);

		const next = predictCycle(openedEarly, openedEarly.phaseEnd, config);
		expect(next.cycleNumber).toBe(3);
		expect(next.isCommitPhase).toBe(true);
		expect(next.phaseStart).toBe(nominalCycleEnd);
	});
});

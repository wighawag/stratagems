import {describe, expect, it} from 'vitest';
import {
	calculateCycleInfo,
	revealPhaseStartTime,
	type CycleConfig,
} from '$lib/game/core/cycle';

/**
 * `revealPhaseStartTime` is the inverse of the cycle formula, and it exists so a
 * game can tell an outside scheduler WHEN the reveal becomes due, at commit
 * time. Getting it wrong means a scheduled reveal fires in the wrong phase and
 * the player forfeits, so it is checked against the forward formula rather than
 * against hand-computed numbers.
 */
describe('revealPhaseStartTime', () => {
	const config: CycleConfig = {
		commitPhaseDuration: 30,
		revealPhaseDuration: 10,
		startTime: 1_000,
		commitTimeAllowance: 10.1,
		policy: 'timed',
	};

	it('lands exactly on the first instant of the reveal phase', () => {
		for (let cycleNumber = 2; cycleNumber < 40; cycleNumber++) {
			const t = revealPhaseStartTime(config, cycleNumber);

			const atStart = calculateCycleInfo(t, config);
			expect(atStart.currentCycleNumber, `cycle at ${t}`).toBe(cycleNumber);
			expect(atStart.isCommitPhase, `phase at ${t}`).toBe(false);

			// And the instant before it is still the commit phase of that cycle.
			const justBefore = calculateCycleInfo(t - 0.001, config);
			expect(justBefore.currentCycleNumber).toBe(cycleNumber);
			expect(justBefore.isCommitPhase).toBe(true);
		}
	});

	it('accounts for a non-zero start time', () => {
		expect(revealPhaseStartTime(config, 2)).toBe(1_030);
		expect(revealPhaseStartTime({...config, startTime: 0}, 2)).toBe(30);
	});
});

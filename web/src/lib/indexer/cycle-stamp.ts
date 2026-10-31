/**
 * THE CYCLE AN INDEXED STATE IS STAMPED WITH: the cycle the chain was in at the
 * block the state is as of, which is what the framework's handover and its
 * `catching-up` phase read (`./indexed-state.ts`).
 *
 * How it is known depends on the deployment's policy (`CyclePolicy`):
 *
 * - `timed`: from the block's timestamp, with the deployment's durations
 *   (`calculateCycleInfo`). Exact, since the contract's clock is the block's.
 * - `manual` (an offline world): from the state itself. Under Manual the cycle
 *   moves ONLY through a successful `advanceCycle`, every one of which emits the
 *   base's `CycleAdvanced`, so a processor that keeps the cycle the last one
 *   left holds the chain's cycle as of the same block as the rest of the state.
 *   That row is the GAME's (its processor folds it, `cycleOf` reads it); before
 *   the first push the base's cycle is its first, 2, committing. The timestamp
 *   would be wrong here, not merely unneeded: both durations are zero, and the
 *   arithmetic divides by them.
 * - `hybrid` (`TimedWithEarlyAdvance`): REFUSED. Its cycle moves by the clock
 *   (no event) and by a push (an event), so a stamp would need both readings.
 *
 * Written first in stratagems (its `board/board-cycle.ts`).
 */
import {calculateCycleInfo, type CycleConfig} from '$lib/game/core/cycle';

/** The base's first cycle: cycle 1 is the hypothetical reveal phase before it. */
export const FIRST_CYCLE_NUMBER = 2;

/** A deployment whose indexed state cannot be stamped. */
export class UnstampableCyclePolicyError extends Error {
	constructor(readonly policy: CycleConfig['policy']) {
		super(
			`an indexed state cannot stamp the cycle of a ${policy} deployment: its cycle moves both by the clock and by a push, and the stamp reads one or the other`,
		);
		this.name = 'UnstampableCyclePolicyError';
	}
}

/** Throws for a policy the stamp cannot read, so a deployment is refused when its state is made rather than at the first read. */
export function assertStampable(config: CycleConfig): void {
	if (config.policy !== 'timed' && config.policy !== 'manual') {
		throw new UnstampableCyclePolicyError(config.policy);
	}
}

/** Whether the stamp needs the block's timestamp (only the timed policy reads it). */
export function stampNeedsTimestamp(config: CycleConfig): boolean {
	return config.policy === 'timed';
}

/**
 * The cycle a state read as of some block is stamped with. `advancedCycle` is
 * the cycle the last `CycleAdvanced` left in that state (undefined before the
 * first), read only under Manual; `timestamp` is the block's, and is required
 * exactly when `stampNeedsTimestamp`.
 */
export function stampedCycleNumber(
	config: CycleConfig,
	advancedCycle: number | undefined,
	timestamp?: number,
): number {
	assertStampable(config);
	if (config.policy === 'manual') {
		return advancedCycle ?? FIRST_CYCLE_NUMBER;
	}
	if (timestamp === undefined) {
		throw new Error(
			`a timed deployment's state stamp needs the block's timestamp`,
		);
	}
	return calculateCycleInfo(timestamp, config).currentCycleNumber;
}

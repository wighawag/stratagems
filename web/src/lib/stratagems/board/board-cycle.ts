/**
 * THE CYCLE A BOARD STATE IS STAMPED WITH: the cycle the chain was in at the
 * block the state is as of, which is what the framework's handover and its
 * `catching-up` phase read (`./indexed-board.ts`).
 *
 * How it is known depends on the deployment's policy (`CyclePolicy`):
 *
 * - `timed`: from the block's timestamp, with the deployment's durations
 *   (`calculateCycleInfo`). Exact, since the contract's clock is the block's (no
 *   deploy has a `Time` contract since step O).
 * - `manual` (the offline world): from the state itself. The indexer keeps the
 *   cycle the last `CycleAdvanced` left (`advancedCycle`), and under Manual the
 *   cycle moves ONLY through a successful `advance`, every one of which emits
 *   it, so that row is the chain's cycle as of the same block as the rest of the
 *   state. Before the first push the base's cycle is its first, 2, committing.
 *   The timestamp would be wrong here, not merely unneeded: both durations are
 *   zero, and the arithmetic divides by them.
 * - `hybrid` (`TimedWithEarlyAdvance`): REFUSED. Its cycle moves by the clock
 *   (no event) and by a push (an event), so a stamp would need both readings,
 *   and stratagems deploys none.
 */
import type {Data} from 'stratagems-indexer';
import {calculateCycleInfo, type CycleConfig} from '$lib/game/core/cycle';

/** The base's first cycle: cycle 1 is the hypothetical reveal phase before it. */
export const FIRST_CYCLE_NUMBER = 2;

/** A deployment whose board this module cannot stamp. */
export class UnstampableCyclePolicyError extends Error {
	constructor(readonly policy: CycleConfig['policy']) {
		super(
			`stratagems' board cannot stamp the cycle of a ${policy} deployment: its cycle moves both by the clock and by a push, and the board reads one or the other`,
		);
		this.name = 'UnstampableCyclePolicyError';
	}
}

/** Throws for a policy the board cannot stamp, so a deployment is refused when its board is made rather than at the first read. */
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
 * The cycle a state read as of some block is stamped with. `timestamp` is that
 * block's, and is required exactly when `stampNeedsTimestamp`.
 */
export function boardCycleNumber(
	config: CycleConfig,
	data: Pick<Data, 'advancedCycle'>,
	timestamp?: number,
): number {
	assertStampable(config);
	if (config.policy === 'manual') {
		return data.advancedCycle?.cycleNumber ?? FIRST_CYCLE_NUMBER;
	}
	if (timestamp === undefined) {
		throw new Error(
			`a timed deployment's board stamp needs the block's timestamp`,
		);
	}
	return calculateCycleInfo(timestamp, config).currentCycleNumber;
}

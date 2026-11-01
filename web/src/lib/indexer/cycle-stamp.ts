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
 * - `hybrid` (`TimedWithEarlyAdvance`, a table for a fixed set of players):
 *   from BOTH. Its cycle moves by the clock (no event) and by a push that
 *   RE-ANCHORS it (`CycleAdvanced` with `commiting` true: an early close, or a
 *   table's start), from which the clock carries on. So the stamp is the last
 *   anchor's cycle plus the whole cycles elapsed since its block, by this
 *   block's timestamp; before any anchor, the deployment's start, as Timed. An
 *   early REVEAL (`commiting` false) moves no cycle number, so a processor
 *   folds only the re-anchoring pushes, with their block's timestamp.
 *
 * Under Manual the anchor is the same row: a push that opens a reveal phase
 * keeps its cycle's number, so the cycle the last re-anchoring push left IS the
 * cycle the last push left.
 *
 * Written first in stratagems (its `board/board-cycle.ts`).
 */
import {calculateCycleInfo, type CycleConfig} from '$lib/game/core/cycle';

/** The base's first cycle: cycle 1 is the hypothetical reveal phase before it. */
export const FIRST_CYCLE_NUMBER = 2;

/**
 * The last re-anchoring `CycleAdvanced` (`commiting` true) a state folded: the
 * cycle it opened and its block's timestamp. `anchoredAt` is read under the
 * hybrid policy only, so a game whose deployments are never hybrid may leave it
 * out.
 */
export type CycleAnchor = {cycleNumber: number; anchoredAt?: number};

/** Whether the stamp needs the block's timestamp (every policy with a clock). */
export function stampNeedsTimestamp(config: CycleConfig): boolean {
	return config.policy !== 'manual';
}

/**
 * The cycle a state read as of some block is stamped with. `anchor` is the
 * last re-anchoring push folded in that state (undefined before the first),
 * read under Manual and hybrid; `timestamp` is the block's, and is required
 * exactly when `stampNeedsTimestamp`.
 */
export function stampedCycleNumber(
	config: CycleConfig,
	anchor: CycleAnchor | undefined,
	timestamp?: number,
): number {
	if (config.policy === 'manual') {
		return anchor?.cycleNumber ?? FIRST_CYCLE_NUMBER;
	}
	if (timestamp === undefined) {
		throw new Error(
			`a ${config.policy} deployment's state stamp needs the block's timestamp`,
		);
	}
	if (config.policy === 'timed' || anchor === undefined) {
		return calculateCycleInfo(timestamp, config).currentCycleNumber;
	}
	if (anchor.anchoredAt === undefined) {
		throw new Error(
			`a hybrid deployment's state stamp needs the anchor's block timestamp (the processor folds it with the re-anchoring CycleAdvanced)`,
		);
	}
	const cycleDuration = config.commitPhaseDuration + config.revealPhaseDuration;
	const elapsed = Math.max(0, timestamp - anchor.anchoredAt);
	return anchor.cycleNumber + Math.floor(elapsed / cycleDuration);
}

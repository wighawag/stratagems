/**
 * THE `with/fuzd` LAYER: a commit-reveal game's reveal sent by fuzd, so it
 * happens without the player's tab (stratagems' plan, step 8, P1 to P12).
 *
 * What a game composes, in its composition root and nowhere else (R1):
 *
 * - `fuzdSettings(...)`: whether it schedules at all (R2: no URI, an embedded
 *   chain, or no `expectedWorstGasPrice` means no);
 * - `createFuzdScheduler(...)`: the `RevealScheduler` handed to the skeleton
 *   as `parts.scheduler`;
 * - `revealModeFor(scheduled)`: `parts.submission`'s `autoReveal` (P7);
 * - `FuzdExtensions`: the layer's namespace, for the game's
 *   `GameTypes['extensions']`;
 * - `scheduledTurn`, `createScheduledReveal`, `revealOnScheduleFailure`: what
 *   the HUD shows, and the switch to revealing at once when fuzd fails.
 */
export {
	LOCAL_CHAIN_ID,
	scheduleOf,
	slotFor,
	type FuzdExtensions,
	type FuzdSchedule,
} from './schedule';
export {fuzdSettings, revealModeFor, type FuzdSettings} from './config';
export {
	createFuzdScheduler,
	FuzdSchedulingError,
	paymentFor,
	type FuzdClientFactory,
	type FuzdClientLike,
	type FuzdScheduler,
	type FuzdSchedulerParams,
} from './scheduler';
export {
	createFuzdStatus,
	isFinal,
	readFuzdStatus,
	type FuzdStatus,
} from './status';
export {
	createScheduledReveal,
	revealOnScheduleFailure,
	scheduledTurn,
	type ScheduledReveal,
	type ScheduledTurn,
} from './reveal';

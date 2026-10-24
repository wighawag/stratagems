/**
 * How much of a submission this client can actually OPEN before the reveal
 * phase shuts.
 *
 * A submission longer than one chunk is revealed in
 * `ceil(actions / actionsPerReveal)` transactions, sent in order and each
 * waited for, so the reveal phase has to hold that many sequential round trips.
 * That is a property of THIS CLIENT and of the chain it is talking to, not of
 * the game: nonces are strictly ordered per account, so the same chunks could
 * be broadcast in one burst and would still execute in order.
 *
 * THIS IS NOT A TURN CAP, AND THE DIFFERENCE IS THE WHOLE REASON IT IS SHAPED
 * THIS WAY. A cap is a GAME RULE about how much a player may do in one cycle,
 * it only binds where identity is scarce, and the framework deliberately takes
 * no position on it: a game that wants one enforces it in its own reveal. What
 * is computed here is a physical limit of the window - how many transactions
 * fit in the time available - which is true of every game on this template
 * whatever its rules, and which the player runs into as an inability rather
 * than as a refusal by the rules.
 *
 * WHY IT EXISTS AT ALL: going over it costs the stake. A submission whose
 * chunks do not all land before the phase shuts is a MISSED REVEAL, settled by
 * whatever call this game forfeits with, taking what was at stake - which, in a
 * game
 * whose stake is indivisible (custody of an avatar, say), is the whole of it
 * however far the chain got. Nothing on chain prevents committing to a turn
 * that cannot be opened, and nothing can: at commit time the contract is
 * holding a hash.
 *
 * MEASURED, NOT REASONED ABOUT. Against a local node mining on a 1s interval,
 * at `actionsPerReveal` 4 and a 10s reveal phase:
 *
 *   receipt poll   chunks that landed inside the window
 *   4000ms         3   (the client's poll dominates: ~4.0s per chunk)
 *    100ms         9   (the chain dominates: ~1.05s per chunk)
 *
 * So the cost of one sequential chunk is `max(block time, poll interval)`, and
 * both terms matter. That is the model below.
 */

/**
 * The longest this will wait to notice a transaction landed.
 *
 * viem's own default, kept as the ceiling so that a long-cycle deployment (the
 * 23h/1h split two of the games in this lineage run) behaves exactly as it did
 * before this file existed.
 */
export const MAX_RECEIPT_POLL_MS = 4_000;

/**
 * The shortest. A floor rather than "as fast as possible" because every poll is
 * a request, and a dev chain is a single-threaded shared resource: this repo
 * has already had an outage from clients polling it harder than it could
 * answer.
 */
export const MIN_RECEIPT_POLL_MS = 250;

/**
 * How often to look for a receipt, given the window the sends have to fit in.
 *
 * A twentieth of the reveal phase, bounded at both ends. The point is that the
 * poll interval has to be small against the WINDOW, not against any absolute
 * idea of fast: four seconds is nothing in a one-hour reveal phase and is 40%
 * of a ten-second one. Sizing it from the phase is what makes the same client
 * correct for both, which is the range this template has to cover.
 */
export function receiptPollingInterval(revealPhaseDuration: number): number {
	if (!Number.isFinite(revealPhaseDuration) || revealPhaseDuration <= 0) {
		return MAX_RECEIPT_POLL_MS;
	}
	const twentieth = Math.floor((revealPhaseDuration * 1000) / 20);
	return Math.min(
		MAX_RECEIPT_POLL_MS,
		Math.max(MIN_RECEIPT_POLL_MS, twentieth),
	);
}

/** What one sequential chunk costs, in seconds. */
function secondsPerChunk(averageBlockTime: number, pollingInterval: number) {
	// MEASURED AS A MAX RATHER THAN A SUM: a send costs one block to be mined
	// and up to one poll to be noticed, and the two overlap. At a 1s block and a
	// 4s poll the measured cost was 4.02s, not 5s; at a 1s block and a 100ms
	// poll it was 1.05s, not 1.1s.
	return Math.max(averageBlockTime, pollingInterval / 1000);
}

/**
 * How many chunks this client can land inside one reveal phase, or `undefined`
 * if nothing bounds it in time.
 *
 * ONE CHUNK'S WORTH OF THE WINDOW IS HELD BACK, for noticing that the phase
 * opened and for the last receipt to arrive. That makes the answer
 * conservative, deliberately and in the one direction that is safe: refusing a
 * submission that would have fitted costs the player a click, and accepting one
 * that does not costs them the stake.
 *
 * Never less than one when it does answer, because a submission of a single
 * chunk is one transaction and there is no shorter one to offer.
 *
 * A REVEAL PHASE OF ZERO IS NOT A ZERO-LENGTH WINDOW, IT IS NO CLOCK AT ALL,
 * and getting that backwards would have been expensive. Under the MANUAL cycle
 * policy the phases have no durations: the cycle moves when everyone has acted,
 * so a reveal is not racing anything and a turn of any length can be opened.
 * Reading the zero as a deadline would have bounded every manual deployment to
 * a single chunk, which is the tightest possible limit imposed exactly where
 * there is no reason for one.
 */
export function chunksOpenableInRevealPhase(params: {
	/** Seconds. Zero or absent means the cycle has no clock. */
	revealPhaseDuration: number;
	/** Seconds, as measured by the chain clock rather than assumed. */
	averageBlockTime: number;
	/** Milliseconds. */
	pollingInterval: number;
}): number | undefined {
	const {revealPhaseDuration, averageBlockTime, pollingInterval} = params;
	if (!Number.isFinite(revealPhaseDuration) || revealPhaseDuration <= 0) {
		return undefined;
	}
	if (!Number.isFinite(averageBlockTime) || averageBlockTime <= 0) {
		// The chain clock has not measured a block time yet. Bounding on a guess
		// would refuse real clicks on the strength of nothing.
		return undefined;
	}
	const perChunk = secondsPerChunk(averageBlockTime, pollingInterval);
	if (perChunk <= 0) return undefined;
	return Math.max(1, Math.floor((revealPhaseDuration - perChunk) / perChunk));
}

/**
 * How many ACTIONS that is, which is the number a player is held to.
 *
 * The units matter: {@link chunksOpenableInRevealPhase} answers in
 * transactions, and a player plans in actions. One is the other multiplied by
 * the deployment's chunk, which is why this takes it rather than assuming four.
 */
export function actionsOpenableInRevealPhase(params: {
	revealPhaseDuration: number;
	averageBlockTime: number;
	pollingInterval: number;
	actionsPerReveal: number;
}): number | undefined {
	const {actionsPerReveal} = params;
	if (!Number.isInteger(actionsPerReveal) || actionsPerReveal < 1) {
		// A deployment that declares a chunk nobody could reveal is a deployment
		// this build cannot play; `resolvePlacementConfig` is where that is
		// refused. Answering with the smallest honest number rather than throwing
		// keeps this function total, since it is read on every click.
		return 1;
	}
	const chunks = chunksOpenableInRevealPhase(params);
	return chunks === undefined ? undefined : chunks * actionsPerReveal;
}

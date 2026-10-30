/**
 * What this layer keeps with a turn: the record of the schedule it handed to
 * fuzd, under its own namespace of the submission's `extensions`.
 *
 * THE RECORD IS A WIRE, like the submission it is stored with (see
 * `AGENTS.md`, "Commit-reveal rules"): once a game has users, renaming a field
 * here makes the status reader miss every schedule a previous build recorded.
 * It is only a reader's key, never a secret, so losing it costs the HUD its
 * line and nothing else (the reveal is fuzd's and the chain's either way).
 */

/**
 * One turn's schedule, as fuzd knows it. Everything the status routes are
 * keyed by, and nothing they can answer themselves.
 *
 * - `chainId`: fuzd's chain id, a decimal string.
 * - `account`: the SIGNING account, the browser key's address. fuzd keys a
 *   schedule by the account that signed it (`/scheduledExecution/:chainId/
 *   :account/:slot`), NOT by the remote account that will broadcast it.
 * - `remoteAccount`: the account fuzd broadcasts from, which the commit paid.
 * - `slot`: `cycle_<n>_<game contract>`, one per signing account, cycle and
 *   game (fuzd keys it by chain and signing account already).
 * - `batchSize`: how many transactions the reveal is, one per chunk, in order.
 * - `scheduledAt`: when it was scheduled, in seconds (wall clock).
 */
export type FuzdSchedule = {
	chainId: string;
	account: `0x${string}`;
	remoteAccount: `0x${string}`;
	slot: string;
	cycleNumber: number;
	batchSize: number;
	scheduledAt: number;
	/** Chain time the batch is due at: the reveal phase's opening. */
	revealDueAt: number;
	/** How long after `revealDueAt` fuzd may still broadcast it. */
	expiryDelta: number;
	/** Sent in clear (the local chain) rather than timelocked to drand. */
	inClear: boolean;
};

/**
 * THE LAYER'S NAMESPACE of `PersistedSubmission['extensions']`, which a game
 * composes into its `GameTypes['extensions']` so it reads the record back
 * typed, without a cast.
 */
export type FuzdExtensions = {fuzd?: FuzdSchedule};

/** The local chain, which schedules in clear: see `createFuzdScheduler`. */
export const LOCAL_CHAIN_ID = 31337;

/**
 * One slot per cycle and game contract: a later schedule in the same slot
 * replaces it while it is queued (and is silently dropped once it has been
 * broadcast, a fuzd 0.12 behaviour recorded on `work`).
 *
 * fuzd already keys a slot by chain and SIGNING account, and the signing key
 * is the browser key, which plays one identity. What could still collide is
 * one key playing two games on one chain in one cycle, hence the contract.
 */
export function slotFor(cycleNumber: number, contract: `0x${string}`): string {
	return `cycle_${cycleNumber}_${contract.toLowerCase()}`;
}

/** The schedule recorded with any of these turns, if one was. */
export function scheduleOf(
	turns: readonly {extensions?: FuzdExtensions}[],
): FuzdSchedule | undefined {
	for (const turn of turns) {
		if (turn.extensions?.fuzd) return turn.extensions.fuzd;
	}
	return undefined;
}

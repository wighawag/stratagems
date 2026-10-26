/**
 * The name for the one failure a player can act on.
 *
 * A move is signed by the local signer, which holds nothing until someone puts
 * gas in it. When it runs dry every commit and every reveal fails, and a reveal
 * that fails costs the player their stake, so this is the failure most worth
 * naming precisely and offering a remedy for.
 *
 * RECOGNISING it is not this file's job any more. That is
 * `isInsufficientFundsFailure` in `$lib/core/transaction`, upstream, where it
 * sits next to `txErrorSummary` and is shared by every app on this path. This
 * file used to carry a private classifier written to be deleted once that
 * landed; it has landed, and it is better (it excludes contract reverts by type
 * and by text before reading any prose, so a `require` string that happens to
 * say "insufficient funds" cannot send a player off to buy gas they already
 * have).
 *
 * What remains is this module's own type, which upstream cannot supply because
 * only a game on the commit-reveal base knows WHOSE shortfall it is. The
 * classifier answers "the sending account could not pay"; this says "and that account was the signer we
 * play your moves with, so the remedy is to top IT up" - not the wallet, which
 * is what a player would otherwise reasonably assume.
 *
 * Classification happens ONCE, at the only boundary that sees a raw node error:
 * `broadcastMove()` in ./send.ts, the single funnel for every write a game on
 * the base makes through this module. Everywhere downstream asks `instanceof SignerOutOfFundsError`, because
 * by then it is asking about an error the app itself constructed, not about
 * whatever the node said. That keeps the game's dependency on upstream's
 * classifier to one import.
 *
 * Moves deliberately do NOT go through `balanceCheck.ensureCanAfford`, which is
 * the app's pre-flight check for user-initiated spending: it opens a modal for
 * the duration of the call, and a modal over the board on every commit and
 * every reveal is exactly the interruption the signer exists to remove. So the
 * shortfall is caught here, after the fact, from what the node said.
 */

/** A move that failed because the account sending it could not pay the gas. */
export class SignerOutOfFundsError extends Error {
	constructor(
		/** What the node actually said, kept for the details view. */
		readonly cause: unknown,
	) {
		super('Not enough gas to send this move.');
		this.name = 'SignerOutOfFundsError';
	}
}

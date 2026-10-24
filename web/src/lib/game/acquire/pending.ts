/**
 * Finding an acquisition this browser has already paid for.
 *
 * WHY THIS IS NOT A FLAG IN A STORE. `acquire.ts` holds the state of an
 * attempt, and a store dies with the tab. Reload while the transaction is in
 * flight and the setup gate goes back to offering the thing to someone whose
 * money is already spent. Whether that costs them twice depends on the game and
 * the answer is not reassuring: an acquisition that mints a fresh item under a
 * fresh id does not collide with the first, so the second attempt buys another
 * one and charges again.
 *
 * The evidence that an acquisition exists is a transaction, and this app
 * already keeps a durable, per-account record of transactions: the operations
 * ledger in account data, which is what the signer's own moves are recovered
 * from across a reload. So this reads THAT rather than writing a second copy of
 * it beside it. Writing a "buying" flag into local storage would be exactly
 * that second copy, with its own staleness, its own cleanup and its own way of
 * disagreeing with the chain.
 *
 * It works for a purchase paid from a SECOND wallet only because the payment
 * rail's client is wrapped by the transaction tracker. A rail whose client is
 * not tracked sends purchases that never reach the ledger at all, and this
 * finds nothing for them.
 *
 * Pure and taking a snapshot, so the whole rule is testable without a chain, a
 * browser or an app context.
 */
import type {OnchainOperation} from '$lib/account/AccountData';
import {getMainTxHash, getOperationStatusInfo} from '$lib/view/operation';

export type PendingAcquisition = {
	/** The operation's id in the ledger. */
	id: string;
	/** The transaction to point a player at, when there is one. */
	hash?: `0x${string}`;
	/**
	 * Included and successful, but not final yet.
	 *
	 * What was bought exists on chain from this moment, so what is being waited
	 * for is only the ledger dropping the operation. Worth telling apart: it is
	 * the difference between "your money is in the mempool" and "you have it and
	 * the page has not caught up".
	 */
	landed: boolean;
};

/**
 * The acquisition this account has in flight, if any.
 *
 * IDENTIFIED BY WHAT IT CALLS AND WHERE. The tracker populates
 * `{type: 'functionCall', functionName}` for every `writeContract`, and the
 * contract address pins it to the one this game acquires through, so nothing
 * else the player does can be mistaken for it. Matching on the function name
 * alone is enough in a small app and stops being enough the moment any other
 * contract in it gains a function of the same name.
 *
 * WHOSE list it is does not need checking: account data is keyed by the
 * authenticated account, so an operation here belongs to the player whether
 * they paid from their own wallet or somebody else's paid on their behalf.
 *
 * A FAILED transaction is not pending, deliberately: it charged gas, it
 * delivered nothing, and the player has to be able to try again. Only a
 * transaction that is still going, or one that has succeeded and not yet been
 * retired from the ledger, stands between them and a second attempt.
 */
export function findPendingAcquisition(params: {
	operations: Record<string, OnchainOperation>;
	/** The contract the acquiring call is sent to. */
	contract: `0x${string}`;
	/** The function it calls. */
	functionName: string;
}): PendingAcquisition | undefined {
	const {operations, functionName} = params;
	const wanted = params.contract.toLowerCase();

	let found: PendingAcquisition | undefined;
	let newest = -Infinity;

	for (const [id, operation] of Object.entries(operations)) {
		const metadata = operation.metadata;
		if (metadata.type !== 'functionCall') continue;
		if (metadata.functionName !== functionName) continue;
		// `call.to`: what was ASKED is one fact per operation, rather than being
		// nested beside the metadata that says what it meant.
		if (operation.call.to?.toLowerCase() !== wanted) continue;

		// The same rule the transaction list and the pending badge use, rather than
		// a second reading of the observer's state here. Two answers to "is this
		// still happening" is how a spinner and a list end up contradicting each
		// other in front of the player.
		const status = getOperationStatusInfo(operation.state).kind;
		if (status !== 'pending' && status !== 'success') continue;

		// Ids are generated from the clock, so the largest is the most recent. It
		// only matters when there is more than one, which means a player who
		// acquired twice deliberately: report the one still happening now.
		const at = Number(id);
		if (!(at > newest)) continue;
		newest = at;
		found = {
			id,
			// The attempt that actually LANDED when one has, not merely the first
			// one sent. They differ exactly when a transaction was stuck and
			// replaced, and that is the case where this hash is most likely to be
			// looked at: reporting the superseded attempt would send the player to a
			// transaction that never made it. Falls back to the first attempt, which
			// is what it always was, while nothing has been included yet.
			hash: getMainTxHash(operation),
			landed: status === 'success',
		};
	}

	return found;
}

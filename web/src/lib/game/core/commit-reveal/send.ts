/**
 * The one funnel every move on the commit-reveal base goes out through.
 *
 * A commit, each chunk of a reveal, a cycle advance and a missed-reveal
 * settlement are all sent by the local signer, silently, and all of them have
 * to fail the same way when that signer cannot pay. So they share this file
 * rather than each growing its own send.
 */
import {get} from 'svelte/store';
import type {CoreServices} from '$lib/context/core';
import {isInsufficientFundsFailure} from '$lib/core/transaction';
import {SignerOutOfFundsError} from './errors';

/**
 * What sending a move needs.
 *
 * `signerExecutor`, NOT `accountExecutor`: moves are signed by the local
 * signer so the player is never prompted mid-submission, and so an account
 * with no wallet provider (email/social sign-in) can play at all. See where
 * the game executor is built in `context/core.ts`.
 *
 * `signerBalance` because a move the signer demonstrably cannot pay for is
 * refused before it is sent; see {@link refuseWhenTheSignerHoldsNothing}.
 */
export type MoveDeps = Pick<
	CoreServices,
	| 'connection'
	| 'signerExecutor'
	| 'deployments'
	| 'publicClient'
	| 'signerBalance'
>;

/** The part of an executor a move needs: something that can write. */
export type MoveExecutor = {
	client: {writeContract: (request: never) => Promise<`0x${string}`>};
};

/**
 * Refuse a move the signer demonstrably cannot pay for, BEFORE it is sent.
 *
 * A DOOMED SEND IS NOT FREE, which is the whole reason this exists. On the local
 * node this template develops and tests against, a transaction the node REJECTS
 * for want of gas still advances that account's pending nonce, permanently: the
 * account is then wedged, because every later transaction is built at a nonce
 * the chain will never reach, gets a hash, and is never mined. Reproduced in
 * isolation, with no app code involved, in
 * `work/notes/findings/a-rejected-transaction-burns-a-nonce-on-edr.md` (the
 * `work` branch, as ADR-0004 records):
 * drain an account, send, watch the send be refused and `pending` go up anyway.
 * `hardhat_setNonce` will not put it back.
 *
 * The cost of that lands squarely on the feature this module is most careful
 * about: the player tops up, the submission retries, and the retry can never
 * mine, so a stake that was recoverable is lost to a stuck `Committing`
 * instead. That is the exact failure `out-of-gas.e2e.ts` exists to prevent,
 * arriving through the remedy rather than the original fault.
 *
 * THE CHECK IS DELIBERATELY NARROW, and reads as an assertion about the app
 * rather than about the chain. It fires only when the balance the player is
 * ALREADY being shown says zero: a store that has loaded, and loaded a nought.
 * So it costs no RPC round trip, it cannot contradict the UI (if it refuses, the
 * screen is already offering the top-up), and an unloaded or stale store simply
 * falls through to the behaviour below, which is what shipped before this.
 *
 * It does NOT try to answer "can this afford THIS move", which would need a gas
 * estimate on a per-move path and would still be a guess. A partially funded
 * signer can still be rejected by the node and still burn a nonce there. That is
 * a smaller window and a node defect rather than this app's, and paying an
 * estimate on every commit and every reveal to narrow it is not a trade worth
 * making silently.
 */
function refuseWhenTheSignerHoldsNothing(deps: MoveDeps): void {
	const balance = get(deps.signerBalance);
	if (balance.step === 'Loaded' && balance.value === 0n) {
		throw new SignerOutOfFundsError(
			new Error('the signer holds no gas, so this move was not sent'),
		);
	}
}

/**
 * Put a move on the wire, and do not wait for it to be mined.
 *
 * Deliberately does NOT go through `balanceCheck.ensureCanAfford`.
 *
 * That helper is the app's user-facing spending check: it opens a modal for the
 * whole call ("Preparing Transaction" while it estimates, then an
 * insufficient-funds prompt), and it checks the balance of the WALLET. Neither
 * is right for a move. A move is signed by the local signer with no prompt, so
 * a modal appearing over the board on every commit and every reveal is exactly
 * the interruption the signer exists to remove - and the balance it was
 * checking belonged to a different address from the one actually paying.
 *
 * The signer needs gas of its own; that is surfaced up front as a balance the
 * player can top up, not discovered mid-submission. See `signerBalance` in the
 * context.
 *
 * SPLIT FROM {@link confirmMove} SO A TURN CAN BE PIPELINED. A chained reveal
 * sends one transaction per chunk, and waiting for each receipt before
 * broadcasting the next costs `max(block time, poll interval)` EVERY TIME -
 * which is what made a ten-second reveal phase hold three chunks. Broadcasting
 * is nearly free by comparison (measured: 13 chunks out in 168ms), so the wait
 * happens once, afterwards, for all of them.
 *
 * The cast is doing one specific job: viem types `value` differently for a
 * PAYABLE function than the tracked client's `writeContract` generic expects.
 * Nothing about the VALUE is wrong - commit and reveal are payable in the ABI
 * and neither sends ether.
 */
export async function broadcastMove(
	deps: MoveDeps,
	executor: MoveExecutor,
	request: unknown,
): Promise<`0x${string}`> {
	refuseWhenTheSignerHoldsNothing(deps);
	let hash: `0x${string}`;
	try {
		hash = await executor.client.writeContract(request as never);
	} catch (error) {
		// THE boundary. This is the only place that sees a raw node error for a
		// move, so it is the only place that classifies one: everything
		// downstream asks `instanceof SignerOutOfFundsError` instead of running
		// upstream's classifier again over an error this app already named.
		//
		// Named as its own type so the UI can offer the remedy (topping the
		// SIGNER up) instead of a dead end, and so the submission can carry on once
		// the money lands. See ./errors.
		if (isInsufficientFundsFailure(error)) {
			throw new SignerOutOfFundsError(error);
		}
		throw error;
	}
	return hash;
}

/**
 * Wait for one broadcast move to be mined, and refuse a revert.
 *
 * Waiting for inclusion matters more than it looks. `writeContract` resolves as
 * soon as the transaction is BROADCAST, so without this a commitment that
 * reverts (an empty reserve, a bond the reserve cannot cover) would still
 * resolve happily, the submission would call itself Committed, and the only
 * symptom would be a baffling `NothingToReveal` a phase later. The submission's
 * states are what the player is told about something they have money on, so
 * they have to mean what they say.
 */
export async function confirmMove(
	deps: Pick<MoveDeps, 'publicClient'>,
	hash: `0x${string}`,
	what: string,
	pollingInterval?: number,
): Promise<void> {
	// HOW OFTEN WE LOOK IS SIZED FROM THE REVEAL PHASE, not left at viem's
	// default of four seconds.
	//
	// Measured against a local node mining on a 1s interval with a 10s reveal
	// phase: at the default poll, one chunk costs ~4.0s and only THREE land
	// before the window shuts, so a turn of sixteen actions could not be opened
	// at all - and a turn that cannot be opened is a missed reveal, which takes
	// the stake. At a poll sized from the phase the cost per chunk falls to the
	// block time and nine land. The cost of one chunk is `max(block time, poll)`,
	// so this term is half of what a long turn costs and it was free.
	//
	// `undefined` leaves viem's default in place, which is what a deployment
	// with no declared reveal phase gets. See `game/core/reveal-window.ts`.
	const receipt = await deps.publicClient.waitForTransactionReceipt({
		hash,
		...(pollingInterval === undefined ? {} : {pollingInterval}),
	});
	if (receipt.status === 'reverted') {
		throw new Error(`${what} was rejected by the contract`);
	}
}

/**
 * Broadcast, then wait. What a single-transaction move wants: a commit, an
 * advance, one settlement call.
 */
export async function sendMove(
	deps: MoveDeps,
	executor: MoveExecutor,
	request: unknown,
	what: string,
	pollingInterval?: number,
): Promise<`0x${string}`> {
	const hash = await broadcastMove(deps, executor, request);
	await confirmMove(deps, hash, what, pollingInterval);
	return hash;
}

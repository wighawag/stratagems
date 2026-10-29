/**
 * The `CommitRevealAdapter` for any game on the commit-reveal base.
 *
 * The framework's submission decides WHEN these are called and keeps the secret
 * between the two; this file is only the translation into the base's own calls
 * (`makeCommitment`, `reveal`, `getCommitment`, `getReserve`), which every game
 * on the base exposes under the same names. What a game supplies is its
 * contract, its action's ABI, how its identity is spelled on chain, and what to
 * bond for a turn.
 */
import {get} from 'svelte/store';
import {encodeFunctionData, zeroAddress} from 'viem';
import type {
	CommitmentStatus,
	CommitOutcome,
	CommitRevealAdapter,
	PlayerIdentity,
	RevealScheduleRequest,
	RevealScheduler,
	RevealTransaction,
	SchedulerPayment,
} from '../seams';
import {receiptPollingInterval} from '../reveal-window';
import {
	buildChainedCommitment,
	buildCommitmentChain,
	chunkDueNext,
} from './chain';
import type {
	ActionEncoding,
	CommitmentOnChain,
	CommitRevealContract,
	OnchainIdentity,
} from './contract';
import {broadcastMove, confirmMove, type MoveDeps} from './send';

/** Two heads as the chain means them: hex case is not a difference. */
function sameHead(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

/** Nobody to pay: what the commit carries without a scheduler. */
const NO_PAYMENT: SchedulerPayment = {payee: zeroAddress, value: 0n};

/**
 * The reveal of a turn as transactions anyone may send, one per chunk, in the
 * order they must land. The same call the adapter's own reveal makes, at the
 * same declared gas limit, with nobody paid (`payee` zero, no value): it is
 * what a scheduler is handed to broadcast later.
 */
export function buildRevealTransactions<TAction>(params: {
	contract: CommitRevealContract;
	encoding: ActionEncoding;
	actionsPerReveal: number;
	revealGas: bigint;
	player: bigint;
	actions: readonly TAction[];
	secret: `0x${string}`;
}): RevealTransaction[] {
	const chain = buildCommitmentChain({
		actions: params.actions,
		secret: params.secret,
		actionsPerReveal: params.actionsPerReveal,
		encoding: params.encoding,
	});
	return chain.map((chunk) => ({
		to: params.contract.address,
		data: encodeFunctionData({
			abi: params.contract.abi,
			functionName: 'reveal',
			args: [
				params.player,
				chunk.actions,
				params.secret,
				chunk.furtherActions,
				zeroAddress,
			],
		}),
		gas: params.revealGas,
	}));
}

export type CommitRevealAdapterParams<
	TIdentity extends PlayerIdentity,
	TAction,
> = {
	deps: MoveDeps;
	contract: CommitRevealContract;
	encoding: ActionEncoding;
	onchainIdentity: OnchainIdentity<TIdentity>;
	/**
	 * THE DEPLOYMENT'S CHUNK SIZE: the head of the chain depends on how the turn
	 * was cut, so a client hashing at a different size commits something the
	 * contract cannot follow.
	 */
	actionsPerReveal: number;
	/** Gas LIMITS for one commit and one reveal step, declared by the deploy. */
	gas: {commit: bigint; reveal: bigint};
	/**
	 * The reveal phase, in seconds, which sizes how often a receipt is looked
	 * for (`game/core/reveal-window.ts`).
	 */
	revealPhaseDuration: number;
	/**
	 * What to bond for this turn, given the reserve it is bonded from. The
	 * game's policy; {@link bondForWholeChunks} in `./config` is the one that
	 * does not leak the turn's length.
	 */
	bondFor: (actions: readonly TAction[], reserve: bigint) => bigint;
	/**
	 * Run before a commitment is built or sent, to refuse one that cannot succeed.
	 * Throwing here surfaces as the submission's Error state, so whatever is
	 * thrown is read by the player: it should say what to do about it.
	 *
	 * Used for the unrevealed-commitment case, which the contract would otherwise
	 * reject with a bare `PreviousCommitmentNotRevealed` after the player had
	 * already paid gas.
	 */
	beforeCommit?: () => Promise<void>;
};

export function createCommitRevealContractAdapter<
	TIdentity extends PlayerIdentity,
	TAction,
>(
	params: CommitRevealAdapterParams<TIdentity, TAction>,
): CommitRevealAdapter<TIdentity, TAction> {
	const {deps, contract, encoding, actionsPerReveal, gas} = params;

	/**
	 * How often to look for a receipt, sized from the reveal phase.
	 *
	 * Computed once: it depends only on the deployment. See
	 * `game/core/reveal-window.ts` for the measurement behind it, and note that
	 * this is half of what a long turn costs - the cost of one sequential chunk
	 * is `max(block time, poll interval)`, so leaving this at viem's four-second
	 * default made a ten-second reveal phase hold three chunks instead of nine.
	 */
	const receiptPoll = receiptPollingInterval(params.revealPhaseDuration);

	async function ready() {
		const {connection, signerExecutor} = deps;
		await connection.ensureConnected();
		const $executor = get(signerExecutor);
		if ($executor.status === 'cannot-send') {
			throw new Error('This account cannot send transactions in this mode.');
		}
		if ($executor.status !== 'ready') {
			throw new Error(
				'No signing key yet. Sign in so the game can play your moves without prompting you for each one.',
			);
		}
		return $executor;
	}

	/**
	 * Where the contract thinks this player's turn has got to.
	 *
	 * One read, made once per reveal rather than once per chunk: the chain is
	 * walked in order and each transaction is waited for, so the head after chunk
	 * `i` is `chunk[i].furtherActions` by construction. Re-reading between chunks
	 * would cost a round trip inside a reveal window that a multi-chunk turn is
	 * already spending several transactions of.
	 */
	async function headOnChain(identity: TIdentity): Promise<CommitmentOnChain> {
		return (await deps.publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName: 'getCommitment',
			args: [params.onchainIdentity(identity)],
		})) as CommitmentOnChain;
	}

	return {
		buildCommitment: ({actions, secret}) =>
			buildChainedCommitment({actions, secret, actionsPerReveal, encoding}),

		revealTransactions: ({identity, actions, secret}) =>
			buildRevealTransactions({
				contract,
				encoding,
				actionsPerReveal,
				revealGas: gas.reveal,
				player: params.onchainIdentity(identity),
				actions,
				secret,
			}),

		async commit<TExtensions extends object = {}>({
			identity,
			hash,
			actions,
			secret,
			cycleNumber,
			revealDueAt,
			scheduler,
		}: Parameters<CommitRevealAdapter<TIdentity, TAction>['commit']>[0] & {
			scheduler?: RevealScheduler<TIdentity, TExtensions>;
		}): Promise<CommitOutcome<TExtensions>> {
			await params.beforeCommit?.();
			const executor = await ready();

			// THE SCHEDULER IS ASKED FIRST, and only for the payment: who to pay
			// and how much, which the commitment then carries, so paying and
			// committing are one transaction. Its failure fails nothing: the turn
			// commits unpaid and is reported unscheduled. A manually advanced chain
			// has no reveal time to schedule for, so nothing is asked.
			const request: RevealScheduleRequest<TIdentity> | undefined =
				scheduler && revealDueAt !== undefined
					? {
							identity,
							cycleNumber,
							revealDueAt,
							transactions: buildRevealTransactions({
								contract,
								encoding,
								actionsPerReveal,
								revealGas: gas.reveal,
								player: params.onchainIdentity(identity),
								actions,
								secret,
							}),
						}
					: undefined;
			let payment: SchedulerPayment | undefined;
			if (scheduler && request) {
				try {
					payment = await scheduler.prepare(request);
				} catch {
					payment = undefined;
				}
			}
			const paid = payment ?? NO_PAYMENT;

			// The reserve is read for the bond's cap, from the chain and not a
			// store: it is one read against a commitment that is about to be
			// immovable. See `bondForWholeChunks` for why the bond is not simply
			// the turn's cost.
			const reserve = (await deps.publicClient.readContract({
				address: contract.address,
				abi: contract.abi,
				functionName: 'getReserve',
				args: [params.onchainIdentity(identity)],
			})) as bigint;
			const bond = params.bondFor(actions, reserve);

			const commitTransaction = await broadcastMove(deps, executor, {
				address: contract.address,
				abi: contract.abi,
				functionName: 'makeCommitment',
				// `identity` is WHO PLAYS; the executor sending this is the signer
				// acting for it. The contract checks the pair, so a signer that has
				// not been authorised (or has been revoked) reverts here rather than
				// quietly bonding its own empty reserve. The commitment, the bond
				// and what it wins all belong to the identity, so losing this
				// browser costs a key and nothing else.
				//
				// `payee` and `value` are the scheduler's payment, forwarded by the
				// contract; zero and nothing without one.
				args: [params.onchainIdentity(identity), hash, bond, paid.payee],
				...(paid.value > 0n ? {value: paid.value} : {}),
				account: executor.account,
				chain: null,
				// THE LIMIT, DECLARED BY THE DEPLOYMENT. See the reveal below
				// for why this is passed rather than estimated.
				gas: gas.commit,
			});

			// THE SCHEDULE GOES OUT ONCE THE COMMIT IS BROADCAST, beside the wait
			// for its receipt rather than after it: the tab is most likely to be
			// closed right after the player commits, and every second the reveal
			// is not scheduled is a second in which closing it costs the stake.
			// It cannot fail the commit, so its error is caught here.
			const scheduled: Promise<{
				revealScheduled: boolean;
				extensions?: Partial<TExtensions>;
			}> =
				scheduler && request && payment
					? scheduler.submit({...request, commitTransaction, payment}).then(
							(extensions) => ({
								revealScheduled: true,
								...(extensions ? {extensions} : {}),
							}),
							() => ({revealScheduled: false}),
						)
					: Promise.resolve({revealScheduled: false});

			await confirmMove(deps, commitTransaction, 'The commitment', receiptPoll);
			const schedule = await scheduled;
			return {
				hash: commitTransaction,
				...(scheduler ? schedule : {}),
			};
		},

		/**
		 * What the chain says about this cycle's turn (P9), from one read of the
		 * head:
		 *
		 * - still held for `cycleNumber`, from whichever chunk: `open`;
		 * - closed (cycle zero) on this turn's LAST chunk: `revealed`;
		 * - anything else, a failed read included: `unknown`.
		 *
		 * TWO CLOSINGS LOOK THE SAME AS A REVEAL, and both need the player's own
		 * other device acting against this one: a cancellation of a ONE-chunk turn
		 * (cancelling keeps the committed head, which for one chunk is the last),
		 * and a settlement shown the chunks in a later cycle. Neither is anything
		 * the framework sends, and the missed-reveal reader still asks the chain
		 * whether anything is owed.
		 */
		async commitmentStatus({
			identity,
			actions,
			secret,
			cycleNumber,
		}): Promise<CommitmentStatus> {
			let onChain: CommitmentOnChain;
			try {
				onChain = await headOnChain(identity);
			} catch {
				return 'unknown';
			}
			const chain = buildCommitmentChain({
				actions,
				secret,
				actionsPerReveal,
				encoding,
			});
			if (onChain.cycleNumber === BigInt(cycleNumber)) {
				return chunkDueNext(chain, onChain.hash) === undefined
					? 'unknown'
					: 'open';
			}
			if (
				onChain.cycleNumber === 0n &&
				sameHead(onChain.hash, chain[chain.length - 1].hash)
			) {
				return 'revealed';
			}
			return 'unknown';
		},

		/**
		 * Open the turn, in as many transactions as the chunk size demands.
		 *
		 * IT RESUMES RATHER THAN RESTARTS. Which chunk is due is read off the
		 * contract, so a reveal interrupted halfway - by a reload, by a signer that
		 * ran out of gas between chunks, by a second device having sent the first
		 * one - picks up exactly where the chain got to. A browser that remembered
		 * instead would re-send a chunk the head has already moved past, be
		 * refused, and report a failure to a player whose turn was in fact fine.
		 *
		 * The hash it hands back is the LAST one, because that is the transaction
		 * that completed the turn.
		 */
		async reveal({identity, actions, secret, onProgress}) {
			const executor = await ready();

			const chain = buildCommitmentChain({
				actions,
				secret,
				actionsPerReveal,
				encoding,
			});
			const onChain = await headOnChain(identity);
			if (onChain.cycleNumber === 0n) {
				// SOMEBODY ELSE MAY HAVE OPENED IT, and anyone may: a scheduler, the
				// player's other device, a stranger. A completed reveal zeroes the
				// cycle and leaves the head at the last chunk it opened, so a head
				// equal to this turn's last chunk is this turn, revealed, and not a
				// failure to report.
				if (sameHead(onChain.hash, chain[chain.length - 1].hash)) {
					return {alreadyRevealed: true};
				}
				throw new Error('There is no commitment on chain left to reveal.');
			}
			const from = chunkDueNext(chain, onChain.hash);
			if (from === undefined) {
				// NOT a retryable failure and not a node problem: the contract is
				// holding a turn that is not this one. Re-sending against it would
				// be revealing somebody else's commitment, which the hash check
				// would refuse anyway, so saying what is actually wrong is the only
				// useful thing to do with it.
				throw new Error(
					'The commitment on chain is not the turn this browser is holding, so it cannot be revealed from here.',
				);
			}

			onProgress?.({done: from, total: chain.length});

			// BROADCAST EVERY CHUNK FIRST, THEN WAIT FOR ALL OF THEM.
			//
			// Nonces are per account and strictly ordered, so a transaction at nonce
			// `n + 1` cannot execute before the one at `n`: the chunks resolve in the
			// order they were sent whatever order they arrive in, which is the
			// property that makes this safe. Chunk `i + 1` is checked against a head
			// chunk `i` writes, and that still holds - MEASURED, not assumed: 104
			// chunks executed in order inside a single block with every hash check
			// passing.
			//
			// WHAT IT IS WORTH: waiting for each receipt before sending the next cost
			// `max(block time, poll interval)` per chunk, so a ten-second reveal phase
			// held three chunks - twelve actions - and a longer turn could not be
			// opened at all, which is a missed reveal and forfeits the stake. Measured
			// at 13 chunks on a 1s chain: 10,282ms and only 9 landed, against 1,199ms
			// with all 13 in ONE block.
			//
			// WHY THE BROADCASTS ARE STILL AWAITED ONE AT A TIME, which is the whole
			// difference between this and signing all `k` up front. On the node this
			// template develops against, a REJECTED send burns a nonce permanently
			// (see `refuseWhenTheSignerHoldsNothing` in ./send.ts), so a pre-signed
			// burst turns one rejection into a stranded turn: every chunk behind it
			// holds a nonce the chain will never reach. Awaiting each broadcast means
			// a rejection stops the loop before the rest are ever built, and it keeps
			// the nonce and in-flight machinery one-dispatch-at-a-time, which is what
			// it is. It costs almost nothing: the same 13 chunks go out in 168ms
			// against 23ms pre-signed, both negligible beside one block.
			//
			// So the arithmetic a deployment has to satisfy is
			// `ceil(actions / actionsPerReveal)` broadcasts and about one block inside
			// the reveal phase, and that is a property of this client rather than of
			// the chain.
			const partLabel = (i: number) =>
				chain.length === 1
					? 'The reveal'
					: `Part ${i + 1} of ${chain.length} of the reveal`;

			const broadcasts: {index: number; hash: `0x${string}`}[] = [];
			for (let i = from; i < chain.length; i++) {
				const sent = await broadcastMove(deps, executor, {
					address: contract.address,
					abi: contract.abi,
					functionName: 'reveal',
					// `player` rather than msg.sender: the contract accepts a reveal
					// submitted by anyone, so that being offline is not automatically
					// a forfeit. Here the player reveals for themselves.
					args: [
						params.onchainIdentity(identity),
						chain[i].actions,
						secret,
						chain[i].furtherActions,
						zeroAddress,
					],
					account: executor.account,
					chain: null,
					// THE LIMIT, DECLARED BY THE DEPLOYMENT AND NOT ESTIMATED.
					//
					// Passing it does two things. It makes the cost of a reveal a
					// CEILING the player can be told about in advance, which is what
					// lets gas be denominated in moves at all; and it removes an
					// `eth_estimateGas` round trip from every chunk, inside a window
					// a multi-chunk turn is already spending several transactions of.
					//
					// WHAT MAKES IT SAFE IS NOT THIS LINE. A limit below what the
					// transaction needs is not a slow turn, it is an out-of-gas
					// reveal, which is a MISSED reveal and forfeits the stake. Three
					// things stand behind it: the figure is measured against the
					// game's own contracts rather than inherited from a template that
					// runs different ones (ADR-0003); a gas-budget test fails if the
					// worst case a chunk can reach ever grows within 10% of it; and
					// gas USAGE is a property of the code and the pinned EVM revision
					// rather than of the chain, so what varies per deployment is the
					// PRICE, which is `expectedWorstGasPrice` and is declared per
					// chain already.
					gas: gas.reveal,
				});
				broadcasts.push({index: i, hash: sent});
			}

			// PROGRESS COUNTS LANDINGS, NOT SENDS, which is what makes the pipelining
			// invisible to the submission: a chunk that has been broadcast has not
			// been applied, and telling a player otherwise would be telling them
			// their turn is safe while it is still in a mempool. They are confirmed
			// in order so that the part named in a failure is the FIRST one that
			// failed rather than whichever was noticed first.
			let hash: `0x${string}` | undefined;
			for (const {index, hash: sent} of broadcasts) {
				await confirmMove(deps, sent, partLabel(index), receiptPoll);
				hash = sent;
				onProgress?.({done: index + 1, total: chain.length});
			}

			if (!hash) {
				// Unreachable: `from` indexes a chunk that exists, so the loop runs
				// at least once. Stated rather than asserted away because the return
				// type is what the submission believes about a landed transaction.
				throw new Error('Nothing was left to reveal.');
			}
			return {hash};
		},
	};
}

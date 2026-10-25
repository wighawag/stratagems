/**
 * The template game's `CommitRevealAdapter`.
 *
 * The framework's submission decides WHEN these are called and keeps the secret
 * between the two; this file is only the translation into the Game contract's
 * own calls. That split is the seam: a game with a different identity model, or
 * a contract that names things differently, replaces this file and nothing
 * else.
 */
import {get} from 'svelte/store';
import {encodeAbiParameters, keccak256, zeroAddress, type Account} from 'viem';
import type {Context} from '$lib/context/types';
import type {CommitRevealAdapter} from '$lib/game/core/seams';
import {onchainIdentity, type GameIdentity} from '$lib/game/identity';
import {bondFor, type PlacementConfig} from './config';
import {receiptPollingInterval} from '$lib/game/core/reveal-window';
import {isInsufficientFundsFailure} from '$lib/core/transaction';
import {SignerOutOfFundsError} from './errors';

/** One placement, matching the contract's `Placement` struct. */
export type Placement = {cellID: bigint};

/**
 * The ABI encoding the commitment hash is taken over.
 *
 * It must match `UsingGameInternal._digest` exactly - same types, same
 * order. A mismatch is not a compile error and not a failed read: the commit
 * succeeds, and the reveal reverts with `CommitmentHashNotMatching` once the
 * player's stake is already bonded. `contracts/test/js/Game.test.ts` computes
 * the hash the same way from the other side.
 *
 * THE TRAILING `bytes24` IS THE NEXT CHUNK'S HASH, and it is part of the
 * encoding for EVERY chunk including the last, where it is zero. The contract
 * has one encoding for the same reason this file does: a second one, selected
 * by a branch on the very value that tells the last chunk from the rest, is a
 * second chance to get the one thing wrong that costs a player money.
 */
const COMMITMENT_ABI = [
	{type: 'bytes32'},
	{type: 'tuple[]', components: [{name: 'cellID', type: 'uint64'}]},
	{type: 'bytes24'},
] as const;

/**
 * `bytes24(keccak256(...))`: the contract stores 24 bytes, so the client must
 * truncate the same way. 2 characters for `0x` plus 48 hex digits.
 */
const BYTES24_HEX_LENGTH = 50;

/** `bytes24(0)`: what a chunk carries when there is nothing after it. */
export const NO_FURTHER_ACTIONS =
	'0x000000000000000000000000000000000000000000000000' as const;

/** One reveal transaction's worth of a turn, and what it promises after it. */
export type PlacementChunk = {
	actions: readonly Placement[];
	/** The hash of the chunk after this one, or {@link NO_FURTHER_ACTIONS}. */
	furtherActions: `0x${string}`;
	/** The head this chunk opens, which is what the contract will be holding. */
	hash: `0x${string}`;
	/** The bytes that hash is taken over, kept for the same reason it always was. */
	encoded: `0x${string}`;
};

/**
 * Cut a turn into the pieces the contract will accept.
 *
 * EXACTLY FULL EXCEPT THE LAST, which is the contract's rule and not a
 * convenience: a chunk that promises a successor and is not full is refused, so
 * a client that padded, trimmed or balanced the pieces would build a chain no
 * reveal past the first could follow.
 *
 * An EMPTY turn is still one chunk. It is committed, it is revealed, and it
 * resolves to nothing - which is what an idle player's automatic turn is in a
 * game that punishes silence. Without this it would have no head to commit.
 */
function cutIntoChunks(
	actions: readonly Placement[],
	actionsPerReveal: number,
): Placement[][] {
	if (!Number.isInteger(actionsPerReveal) || actionsPerReveal < 1) {
		throw new Error(
			`this deployment says ${actionsPerReveal} actions per reveal, which is not a turn anybody could open`,
		);
	}
	const chunks: Placement[][] = [];
	for (let i = 0; i < actions.length; i += actionsPerReveal) {
		chunks.push(actions.slice(i, i + actionsPerReveal) as Placement[]);
	}
	if (chunks.length === 0) chunks.push([]);
	return chunks;
}

/**
 * THE HASH CHAIN a turn is committed as.
 *
 * A commitment is not the hash of a turn; it is the head of a chain. Each
 * reveal opens one chunk and rewrites the head to the hash of the next, and the
 * commitment stays open until a chunk arrives declaring none. So the hashes are
 * computed from the LAST chunk BACKWARDS: the head cannot be known until
 * everything that comes after it is.
 *
 * Returns the chain in submission order, so `chunks[0]` is what the first reveal
 * sends and `chunks[0].hash` is the head that was committed.
 */
export function buildPlacementChain(params: {
	actions: readonly Placement[];
	secret: `0x${string}`;
	actionsPerReveal: number;
}): PlacementChunk[] {
	const cut = cutIntoChunks(params.actions, params.actionsPerReveal);

	const chain: PlacementChunk[] = [];
	let furtherActions: `0x${string}` = NO_FURTHER_ACTIONS;
	for (let i = cut.length - 1; i >= 0; i--) {
		const encoded = encodeAbiParameters(COMMITMENT_ABI, [
			params.secret,
			cut[i] as {cellID: bigint}[],
			furtherActions,
		]);
		const hash = keccak256(encoded).slice(
			0,
			BYTES24_HEX_LENGTH,
		) as `0x${string}`;
		chain.unshift({actions: cut[i], furtherActions, hash, encoded});
		furtherActions = hash;
	}
	return chain;
}

/**
 * The commitment for a whole turn: the head of its chain.
 *
 * TAKES THE CHUNK SIZE, because the head depends on it. The same actions and
 * the same secret hash to a DIFFERENT head at a different chunk size, so this
 * cannot be a free function over two arguments the way it was before chaining -
 * anything that recomputes a commitment (the recovery check, most of all) has to
 * be given the deployment's number rather than assume one.
 */
export function buildPlacementCommitment(params: {
	actions: readonly Placement[];
	secret: `0x${string}`;
	actionsPerReveal: number;
}): {hash: `0x${string}`; encoded: `0x${string}`} {
	const chain = buildPlacementChain(params);
	return {hash: chain[0].hash, encoded: chain[0].encoded};
}

/**
 * Where in the chain the contract currently is.
 *
 * READ OFF THE CHAIN, NEVER REMEMBERED. A reveal interrupted halfway - a
 * reload, a signer that ran out of gas between chunks, a second device - leaves
 * the browser with no idea how far it got, and a browser that guessed would
 * either re-send a chunk that has already landed (refused, because the head has
 * moved past it) or skip one (refused, for the same reason). The contract is
 * holding the answer: its `hash` is the head, and the head identifies exactly
 * one chunk of a chain this client can rebuild.
 *
 * Returns the index of the chunk that is due next, or undefined when the head
 * belongs to no chunk of this turn - which means the commitment on chain is not
 * this submission's, and re-sending against it would be sending somebody else's
 * turn.
 */
export function chunkDueNext(
	chain: readonly PlacementChunk[],
	head: `0x${string}`,
): number | undefined {
	// Lowercased on both sides: hex case is a difference no error anywhere would
	// report, and the same normalisation `game/core/recovery` does for the same
	// reason.
	const wanted = head.toLowerCase();
	const index = chain.findIndex((chunk) => chunk.hash.toLowerCase() === wanted);
	return index === -1 ? undefined : index;
}

/**
 * What the adapter needs.
 *
 * `signerExecutor`, NOT `accountExecutor`: commit and reveal are signed by the
 * local signer so the player is never prompted mid-submission, and so an
 * account with no wallet provider (email/social sign-in) can play at all. See
 * where the game executor is built in `context/core.ts`.
 */
export type CommitRevealDeps = Pick<
	Context,
	| 'connection'
	| 'signerExecutor'
	| 'deployments'
	| 'publicClient'
	| 'signerBalance'
>;

/**
 * Send a game move and wait for it to be included.
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
 * WHAT IT DOES DO, since 'after the fact' turned out not to be free: it refuses
 * to put a move on the wire when the app ALREADY knows the signer holds nothing.
 * See {@link refuseWhenTheSignerHoldsNothing}. That is not the modal-opening
 * pre-flight check above, and costs no RPC call: it reads the balance the player
 * is already being shown.
 *
 * Waiting for inclusion matters more than it looks. `writeContract` resolves as
 * soon as the transaction is BROADCAST, so without this a commitment that
 * reverts (an empty reserve, a bond the reserve cannot cover) would still
 * resolve happily, the submission would call itself Committed, and the only
 * symptom would be a baffling `NothingToReveal` a phase later. The submission's
 * states are what the player is told about something they have money on, so
 * they have to mean what they say.
 *
 * The cast is doing one specific job: viem types `value` differently for a
 * PAYABLE function than the tracked client's `writeContract` generic expects.
 * Nothing about the VALUE is wrong - commit and reveal are payable in the ABI
 * and neither sends ether.
 */
/**
 * Refuse a move the signer demonstrably cannot pay for, BEFORE it is sent.
 *
 * A DOOMED SEND IS NOT FREE, which is the whole reason this exists. On the local
 * node this game develops and tests against, a transaction the node REJECTS for
 * want of gas still advances that account's pending nonce, permanently: the
 * account is then wedged, because every later transaction is built at a nonce
 * the chain will never reach, gets a hash, and is never mined. Reproduced in
 * isolation, with no app code involved, in
 * `work/notes/findings/a-rejected-transaction-burns-a-nonce-on-edr.md` (the
 * `work` branch, as ADR-0004 records):
 * drain an account, send, watch the send be refused and `pending` go up anyway.
 * `hardhat_setNonce` will not put it back.
 *
 * The cost of that lands squarely on the feature this file is most careful
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
function refuseWhenTheSignerHoldsNothing(deps: CommitRevealDeps): void {
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
 * SPLIT OUT OF {@link send} SO A TURN CAN BE PIPELINED. A chained reveal sends
 * one transaction per chunk, and waiting for each receipt before broadcasting
 * the next costs `max(block time, poll interval)` EVERY TIME - which is what
 * made a ten-second reveal phase hold three chunks. Broadcasting is nearly free
 * by comparison (measured: 13 chunks out in 168ms), so the wait happens once,
 * afterwards, for all of them.
 */
async function broadcast(
	deps: CommitRevealDeps,
	executor: {
		client: {writeContract: (request: never) => Promise<`0x${string}`>};
	},
	request: unknown,
): Promise<`0x${string}`> {
	refuseWhenTheSignerHoldsNothing(deps);
	let hash: `0x${string}`;
	try {
		hash = await executor.client.writeContract(request as never);
	} catch (error) {
		// THE boundary. This is the only place in the game that sees a raw node
		// error, so it is the only place that classifies one: everything
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
async function confirm(
	deps: CommitRevealDeps,
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

/** Broadcast, then wait. What a single-transaction move wants. */
async function send(
	deps: CommitRevealDeps,
	executor: {
		client: {writeContract: (request: never) => Promise<`0x${string}`>};
	},
	request: unknown,
	what: string,
	pollingInterval?: number,
): Promise<`0x${string}`> {
	const hash = await broadcast(deps, executor, request);
	await confirm(deps, hash, what, pollingInterval);
	return hash;
}

export function createPlacementCommitReveal(params: {
	deps: CommitRevealDeps;
	config: PlacementConfig;
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
}): CommitRevealAdapter<GameIdentity, Placement> {
	const {deps, config} = params;

	/**
	 * How often to look for a receipt, sized from the reveal phase.
	 *
	 * Computed once: it depends only on the deployment. See
	 * `game/core/reveal-window.ts` for the measurement behind it, and note that
	 * this is half of what a long turn costs - the cost of one sequential chunk
	 * is `max(block time, poll interval)`, so leaving this at viem's four-second
	 * default made a ten-second reveal phase hold three chunks instead of nine.
	 */
	const receiptPoll = receiptPollingInterval(config.cycle.revealPhaseDuration);

	async function ready() {
		const {connection, signerExecutor, deployments} = deps;
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
		return {executor: $executor, deployments: get(deployments)};
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
	async function headOnChain(
		identity: GameIdentity,
	): Promise<{hash: `0x${string}`; cycleNumber: bigint}> {
		const deployments = get(deps.deployments);
		return (await deps.publicClient.readContract({
			address: deployments.contracts.Game.address,
			abi: deployments.contracts.Game.abi,
			functionName: 'getCommitment',
			args: [onchainIdentity(identity)],
		})) as {hash: `0x${string}`; cycleNumber: bigint};
	}

	return {
		buildCommitment: ({actions, secret}) =>
			buildPlacementCommitment({
				actions,
				secret,
				// THE DEPLOYMENT'S NUMBER, which is the whole reason it travels in
				// the config: the head of the chain depends on how the turn was cut,
				// so a client hashing at a different size commits something the
				// contract cannot follow.
				actionsPerReveal: config.actionsPerReveal,
			}),

		async commit({identity, hash, actions}) {
			await params.beforeCommit?.();
			const {executor, deployments} = await ready();

			// A WHOLE NUMBER OF CHUNKS, NOT THE EXACT COST. The bond is public -
			// it is in `CommitmentMade` and in what `getCommitment` returns - so
			// the exact cost would tell any observer how many placements the
			// commitment hides, before anybody reveals anything. Rounding up to
			// whole chunks discloses only how many reveal transactions the turn
			// takes, which the reveals disclose anyway.
			//
			// THE SURPLUS IS NOT AT RISK, which is what made this a contract
			// change rather than a client one: the last reveal releases it, and a
			// missed reveal settled WITH the chunks forfeits only what the
			// placements would have cost and returns the rest (see
			// `missed-reveal.ts`, and `UsingGameInternal._acknowledgeMissedReveal`).
			//
			// The reserve is read for the cap (see `bondFor`), from the chain and
			// not the store: it is one read against a commitment that is about
			// to be immovable.
			const reserve = (await deps.publicClient.readContract({
				address: deployments.contracts.Game.address,
				abi: deployments.contracts.Game.abi,
				functionName: 'getReserve',
				args: [onchainIdentity(identity)],
			})) as bigint;
			const bond = bondFor(config, actions.length, reserve);

			return {
				hash: await send(
					deps,
					executor,
					{
						address: deployments.contracts.Game.address,
						abi: deployments.contracts.Game.abi,
						functionName: 'makeCommitment',
						// `identity` is WHO PLAYS, which in this game is the account;
						// the executor sending this is the signer acting for it. The
						// contract checks the pair, so a signer that has not been
						// authorised (or has been revoked) reverts here rather than
						// quietly bonding its own empty reserve. The commitment, the
						// bond and the cells it wins all belong to the identity, so
						// losing this browser costs a key and nothing else.
						//
						// `onchainIdentity` and not the identity itself: how this
						// game's identity is spelled in a contract argument is the one
						// thing `$lib/game/identity` knows and this file must not.
						args: [onchainIdentity(identity), hash, bond, zeroAddress],
						account: executor.account,
						chain: null,
						// THE LIMIT, DECLARED BY THE DEPLOYMENT. See the reveal below
						// for why this is passed rather than estimated.
						gas: config.gas.commit,
					},
					'The commitment',
					receiptPoll,
				),
			};
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
		 * IN ORDER, ONE AT A TIME, and each waited for.
		 *
		 * THEY COULD GO OUT AT ONCE, AND THAT IS WORTH KNOWING BEFORE ANYONE
		 * SHORTENS A REVEAL PHASE. The reason to think they cannot is that chunk
		 * `i + 1` is checked against a head that chunk `i` writes - but nonces are
		 * per account and strictly sequential, so a transaction at nonce `n + 1`
		 * cannot be executed before the one at `n`. Broadcasting all `k` chunks in
		 * one burst would therefore resolve them in exactly this order, in the same
		 * block or in consecutive ones, and would cost one round trip instead of
		 * `k` - which is real seconds inside a window a multi-chunk turn is already
		 * spending several transactions of.
		 *
		 * Three reasons it is sequential today, and none of them is "it would not
		 * work". The FAILURE STORY gets worse: if chunk `i` reverts, every later
		 * chunk is still mined, still reverts and is still paid for, and `send()`
		 * reports one failure at a time rather than "which of `k`". The NONCE
		 * machinery hands out and tracks one dispatch at a time here, and a burst is
		 * where a nonce burned by a rejected send (see
		 * {@link refuseWhenTheSignerHoldsNothing}) costs a whole turn rather than
		 * one transaction. And the sequential version is MEASURED to fit: two chunks
		 * land inside a ten-second reveal phase in the e2e suite, on every node.
		 *
		 * So the arithmetic a deployment has to satisfy today is
		 * `ceil(actions / actionsPerReveal)` SEQUENTIAL sends inside the reveal
		 * phase, and that is a property of this client rather than of the chain.
		 *
		 * The hash it hands back is the LAST one, because that is the transaction
		 * that completed the turn.
		 */
		async reveal({identity, actions, secret, onProgress}) {
			const {executor, deployments} = await ready();

			const chain = buildPlacementChain({
				actions,
				secret,
				actionsPerReveal: config.actionsPerReveal,
			});
			const onChain = await headOnChain(identity);
			if (onChain.cycleNumber === 0n) {
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
			// game develops against, a REJECTED send burns a nonce permanently (see
			// {@link refuseWhenTheSignerHoldsNothing}), so a pre-signed burst turns one
			// rejection into a stranded turn: every chunk behind it holds a nonce the
			// chain will never reach. Awaiting each broadcast means a rejection stops
			// the loop before the rest are ever built, and it keeps the nonce and
			// in-flight machinery one-dispatch-at-a-time, which is what it is. It
			// costs almost nothing: the same 13 chunks go out in 168ms against 23ms
			// pre-signed, both negligible beside one block.
			const partLabel = (i: number) =>
				chain.length === 1
					? 'The reveal'
					: `Part ${i + 1} of ${chain.length} of the reveal`;

			const broadcasts: {index: number; hash: `0x${string}`}[] = [];
			for (let i = from; i < chain.length; i++) {
				const sent = await broadcast(deps, executor, {
					address: deployments.contracts.Game.address,
					abi: deployments.contracts.Game.abi,
					functionName: 'reveal',
					// `player` rather than msg.sender: the contract accepts a reveal
					// submitted by anyone, so that being offline is not automatically
					// a forfeit. Here the player reveals for themselves.
					args: [
						onchainIdentity(identity),
						chain[i].actions as {cellID: bigint}[],
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
					// things stand behind it: the figure is measured against THESE
					// contracts rather than inherited from a template that runs
					// different ones (ADR-0003); `GasBudget.test.ts` fails if the
					// worst case a chunk can reach ever grows within 10% of it; and
					// gas USAGE is a property of the code and the pinned EVM revision
					// rather than of the chain, so what varies per deployment is the
					// PRICE, which is `expectedWorstGasPrice` and is declared per
					// chain already.
					gas: config.gas.reveal,
				});
				broadcasts.push({index: i, hash: sent});
			}

			// PROGRESS COUNTS LANDINGS, NOT SENDS, which it already did and which is
			// what makes this change invisible to the submission: a chunk that has
			// been broadcast has not been applied, and telling a player otherwise
			// would be telling them their turn is safe while it is still in a
			// mempool. They are confirmed in order so that the part named in a
			// failure is the FIRST one that failed rather than whichever was noticed
			// first.
			let hash: `0x${string}` | undefined;
			for (const {index, hash: sent} of broadcasts) {
				await confirm(deps, sent, partLabel(index), receiptPoll);
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

/**
 * Send a prepared request, for callers outside the adapter.
 *
 * Exported so the missed-reveal store can settle a missed commitment through
 * exactly the same wait-for-inclusion path, rather than growing its own.
 */
export {send as sendPlacementTransaction};

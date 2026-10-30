/**
 * THE REVEAL SCHEDULER, ON FUZD: a turn's reveal handed to a service that
 * sends it when the reveal phase opens, so a player who closes the tab still
 * reveals and keeps their stake.
 *
 * It is the framework's `RevealScheduler` seam (`$lib/game/core/seams`), and
 * nothing here knows a game: the adapter builds the reveal's transactions, the
 * submission records what `submit` returns, and this file only talks to fuzd.
 *
 * THE TWO HALVES, in the seam's order (alpha1's):
 *
 * - `prepare`, BEFORE the commit: the player's remote account (fuzd derives one
 *   per signing key), and what to pay it, which the commit carries as `payee`
 *   and `value` so the payment and the commitment are one transaction. The
 *   payment is what THIS reveal requires: the batch's worst cost (every
 *   transaction's declared gas at the chain's `expectedWorstGasPrice`, fuzd's
 *   fees per transaction), less what the remote account already holds beyond
 *   fuzd's reservations for its other slots, never negative and never more
 *   than the batch.
 * - `submit`, once the commit is BROADCAST: the whole reveal as ONE batch,
 *   which fuzd broadcasts in order from the one remote account, at
 *   `revealDueAt`, with the reveal phase as its expiry. Timelocked to drand
 *   everywhere but the local chain, which schedules in clear so the local loop
 *   and the e2e need no internet (P6). It returns the layer's record,
 *   `{fuzd: FuzdSchedule}`, which the submission stores with the turn.
 *
 * EITHER HALF FAILING FAILS NOTHING: the adapter catches it, the turn commits,
 * and is recorded as not scheduled, which the submission reveals itself. Both
 * halves are bounded by a timeout for the same reason: a service that hangs
 * must not hold a commit past the end of its phase.
 */
import {
	createClient,
	type BatchSubmission,
	type FuzdClient,
} from '@fuzd/client';
import type {HttpChainClient} from 'tlock-js';
import type {
	PlayerIdentity,
	RevealScheduleRequest,
	RevealScheduler,
	SchedulerPayment,
} from '$lib/game/core/seams';
import {
	LOCAL_CHAIN_ID,
	slotFor,
	type FuzdExtensions,
	type FuzdSchedule,
} from './schedule';

/** The part of fuzd's client this layer uses: what a test stubs. */
export type FuzdClientLike = Pick<
	FuzdClient,
	| 'assignRemoteAccount'
	| 'computeTotalMaxCost'
	| 'computeBalanceRequired'
	| 'scheduleExecution'
>;

/** How a client is made for a signing key. `@fuzd/client`'s by default. */
export type FuzdClientFactory = (config: {
	privateKey: `0x${string}`;
	schedulerEndPoint: string;
	drand?: HttpChainClient;
}) => FuzdClientLike;

export type FuzdSchedulerParams = {
	/** fuzd's base URL, resolved when asked (it may follow the page's host). */
	schedulerEndPoint: () => string | undefined;
	/** The chain the game is on, as fuzd is told it. */
	chainId: number;
	/** The chain's `expectedWorstGasPrice`: the most each transaction may pay. */
	maxFeePerGasAuthorized: bigint;
	/** How long fuzd may still broadcast after `revealDueAt`: the reveal phase. */
	expiryDelta: number;
	/** The key fuzd requests are signed with: the browser's, when signed in. */
	signerKey: () => `0x${string}` | undefined;
	/** What an account holds on the chain, in wei. */
	balanceOf: (address: `0x${string}`) => Promise<bigint>;
	/** Timelock to drand. Defaults to every chain but the local one (P6). */
	timelock?: boolean;
	/** The drand network to timelock to. fuzd's client defaults to mainnet. */
	drand?: HttpChainClient;
	createClient?: FuzdClientFactory;
	/** Wall clock, in seconds. */
	now?: () => number;
	/** Bound on each half, in milliseconds. */
	timeouts?: {prepare?: number; submit?: number};
};

/** Why a scheduling attempt did not happen. The adapter only sees "failed". */
export class FuzdSchedulingError extends Error {
	constructor(message: string, options?: {cause?: unknown}) {
		super(message, options);
		this.name = 'FuzdSchedulingError';
	}
}

/**
 * What the commit sends the remote account: what THIS reveal requires.
 *
 * The batch's worst cost (`totalMaxCost`), less the balance the account holds
 * beyond what fuzd has reserved for its other schedules (`amountReserved`).
 * Never negative (a funded account is sent nothing) and NEVER MORE THAN THE
 * BATCH: an account short of its other reservations is not topped up for them
 * by this turn, which pays for its own reveal only.
 */
export function paymentFor(params: {
	totalMaxCost: bigint;
	amountReserved: bigint;
	balance: bigint;
}): bigint {
	const free = params.balance - params.amountReserved;
	if (free <= 0n) return params.totalMaxCost;
	return params.totalMaxCost > free ? params.totalMaxCost - free : 0n;
}

const defaultFactory: FuzdClientFactory = (config) =>
	createClient({
		privateKey: config.privateKey,
		schedulerEndPoint: config.schedulerEndPoint,
		...(config.drand ? {drand: config.drand} : {}),
	});

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	what: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new FuzdSchedulingError(`${what} timed out after ${ms}ms`)),
			ms,
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The framework's `RevealScheduler`, with `submit` saying what it records:
 * always `{fuzd}` when it resolves.
 */
export type FuzdScheduler<TIdentity extends PlayerIdentity> = Omit<
	RevealScheduler<TIdentity, FuzdExtensions>,
	'submit'
> & {
	submit(
		request: Parameters<
			RevealScheduler<TIdentity, FuzdExtensions>['submit']
		>[0],
	): Promise<{fuzd: FuzdSchedule}>;
};

export function createFuzdScheduler<TIdentity extends PlayerIdentity>(
	params: FuzdSchedulerParams,
): FuzdScheduler<TIdentity> {
	const factory = params.createClient ?? defaultFactory;
	const timelock = params.timelock ?? params.chainId !== LOCAL_CHAIN_ID;
	const chainId = String(params.chainId) as `${number}`;
	const now = params.now ?? (() => Math.floor(Date.now() / 1000));
	const prepareTimeout = params.timeouts?.prepare ?? 5_000;
	const submitTimeout = params.timeouts?.submit ?? 15_000;

	// ONE CLIENT PER SIGNING KEY, kept while the key is: the remote account is
	// derived from the key, and fuzd's client checks the derivation did not
	// change between `prepare` and `submit`.
	let cached:
		{key: string; endpoint: string; client: FuzdClientLike} | undefined;
	function clientFor(): FuzdClientLike {
		const key = params.signerKey();
		if (!key) throw new FuzdSchedulingError('no signing key to schedule with');
		const endpoint = params.schedulerEndPoint();
		if (!endpoint) throw new FuzdSchedulingError('no fuzd endpoint configured');
		if (!cached || cached.key !== key || cached.endpoint !== endpoint) {
			cached = {
				key,
				endpoint,
				client: factory({
					privateKey: key,
					schedulerEndPoint: endpoint,
					...(params.drand ? {drand: params.drand} : {}),
				}),
			};
		}
		return cached.client;
	}

	function costed(request: RevealScheduleRequest<TIdentity>) {
		if (request.transactions.length === 0) {
			throw new FuzdSchedulingError('a reveal of no transactions');
		}
		return {
			maxFeePerGasAuthorized: params.maxFeePerGasAuthorized,
			transactions: request.transactions.map((t) => ({gas: t.gas})),
		};
	}

	// The game contract is what the reveal calls: every transaction's target.
	function slotOf(request: RevealScheduleRequest<TIdentity>): string {
		return slotFor(request.cycleNumber, request.transactions[0].to);
	}

	async function prepare(
		request: RevealScheduleRequest<TIdentity>,
	): Promise<SchedulerPayment> {
		const client = clientFor();
		const remote = await client.assignRemoteAccount(chainId);
		const payee = remote.address.toLowerCase() as `0x${string}`;
		const {totalMaxCost, amountReserved} = await client.computeBalanceRequired({
			...costed(request),
			chainId,
			slot: slotOf(request),
		});
		const balance = await params.balanceOf(payee);
		return {payee, value: paymentFor({totalMaxCost, amountReserved, balance})};
	}

	async function submit(
		request: RevealScheduleRequest<TIdentity> & {
			commitTransaction: `0x${string}`;
			payment: SchedulerPayment;
		},
	): Promise<{fuzd: FuzdSchedule}> {
		const client = clientFor();
		const slot = slotOf(request);
		const totalMaxCost = client.computeTotalMaxCost(costed(request));
		const submission: BatchSubmission = {
			slot,
			chainId,
			maxFeePerGasAuthorized: params.maxFeePerGasAuthorized,
			// THE WHOLE REVEAL AS ONE BATCH, in the order the chunks must land:
			// fuzd broadcasts a batch's transactions in order from one account,
			// where one schedule per chunk could land chunk `i + 1` first and
			// revert on the hash (P4).
			transactions: request.transactions.map((t) => ({
				to: t.to,
				data: t.data,
				gas: t.gas,
			})),
			timing: {
				type: 'fixed-time',
				scheduledTime: request.revealDueAt,
				expiryDelta: params.expiryDelta,
			},
			// What this schedule may cost, which fuzd counts against the remote
			// account's balance for every LATER schedule (`computeBalanceRequired`).
			paymentReserve: {
				amount: totalMaxCost,
				broadcaster: request.payment.payee,
			},
			inClear: !timelock,
		};
		const result = await client.scheduleExecution(submission);
		if (!result.success) {
			throw new FuzdSchedulingError('fuzd refused the schedule', {
				cause: result.error,
			});
		}
		const schedule: FuzdSchedule = {
			chainId: result.info.chainId,
			account: result.info.account.toLowerCase() as `0x${string}`,
			remoteAccount: request.payment.payee,
			slot: result.info.slot,
			cycleNumber: request.cycleNumber,
			batchSize: request.transactions.length,
			scheduledAt: now(),
			revealDueAt: request.revealDueAt,
			expiryDelta: params.expiryDelta,
			inClear: !timelock,
		};
		return {fuzd: schedule};
	}

	return {
		prepare: (request) =>
			withTimeout(prepare(request), prepareTimeout, 'fuzd prepare'),
		submit: (request) =>
			withTimeout(submit(request), submitTimeout, 'fuzd submit'),
	};
}

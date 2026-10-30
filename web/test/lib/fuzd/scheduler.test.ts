import {describe, expect, it} from 'vitest';
import {createClient, type BatchSubmission} from '@fuzd/client';
import {roundAt, timelockDecrypt} from 'tlock-js';
import {privateKeyToAccount} from 'viem/accounts';
import {
	createFuzdScheduler,
	paymentFor,
	slotFor,
	type FuzdClientLike,
	type FuzdSchedulerParams,
} from '$lib/fuzd';
import type {
	RevealScheduleRequest,
	RevealTransaction,
} from '$lib/game/core/seams';
import {createFakeDrand} from './fake-drand';

/**
 * The scheduler against a STUBBED fuzd client: what it asks fuzd, what it pays,
 * what it schedules, and what it records. The time-locked case runs the REAL
 * `@fuzd/client` against an offline drand (as fuzd's own tests do), with the
 * scheduler endpoint replaced by a function, so the payload it would send is
 * decrypted back here with no network.
 */
const KEY =
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SIGNER = privateKeyToAccount(KEY).address.toLowerCase() as `0x${string}`;
const REMOTE = '0x00000000000000000000000000000000000000Fe' as const;
const GAME = '0x00000000000000000000000000000000000000c0' as const;
const GWEI = 1_000_000_000n;

const TRANSACTIONS: RevealTransaction[] = [
	{to: GAME, data: '0x01', gas: 600_000n},
	{to: GAME, data: '0x02', gas: 600_000n},
	{to: GAME, data: '0x03', gas: 600_000n},
];

function request(
	overrides?: Partial<RevealScheduleRequest<`0x${string}`>>,
): RevealScheduleRequest<`0x${string}`> {
	return {
		identity: '0x00000000000000000000000000000000000000aa',
		cycleNumber: 7,
		revealDueAt: 1_800_000_000,
		transactions: TRANSACTIONS,
		...overrides,
	};
}

/** fuzd's own arithmetic, with no fees: the stub's answer. */
function worstCost(price: bigint, transactions: readonly {gas: unknown}[]) {
	return transactions.reduce(
		(sum, t) => sum + BigInt(t.gas as bigint) * price,
		0n,
	);
}

function stubClient(options?: {
	reservedForOtherSlots?: bigint;
	fail?: 'assign' | 'balance' | 'schedule' | 'refuse';
}) {
	const calls = {
		created: [] as {privateKey: string; schedulerEndPoint: string}[],
		balanceRequired: [] as unknown[],
		scheduled: [] as BatchSubmission[],
	};
	const client: FuzdClientLike = {
		async assignRemoteAccount() {
			if (options?.fail === 'assign') throw new Error('fuzd down');
			return {address: REMOTE} as never;
		},
		computeTotalMaxCost(params) {
			return worstCost(params.maxFeePerGasAuthorized, params.transactions!);
		},
		async computeBalanceRequired(params) {
			calls.balanceRequired.push(params);
			if (options?.fail === 'balance') throw new Error('fuzd down');
			const totalMaxCost = worstCost(
				params.maxFeePerGasAuthorized,
				params.transactions!,
			);
			const amountReserved = options?.reservedForOtherSlots ?? 0n;
			return {
				amountReserved,
				totalMaxCost,
				balanceRequired: amountReserved + totalMaxCost,
			};
		},
		async scheduleExecution(submission) {
			calls.scheduled.push(submission as BatchSubmission);
			if (options?.fail === 'schedule') throw new Error('fuzd down');
			if (options?.fail === 'refuse') return {success: false, error: 'no'};
			return {
				success: true,
				info: {
					chainId: submission.chainId,
					// fuzd answers the SIGNING account, which keys its routes.
					account: SIGNER,
					slot: submission.slot,
					checkinTime: 1,
				},
			};
		},
	};
	return {client, calls};
}

function schedulerWith(
	stub: ReturnType<typeof stubClient>,
	overrides?: Partial<FuzdSchedulerParams> & {balance?: bigint},
) {
	return createFuzdScheduler<`0x${string}`>({
		schedulerEndPoint: () => 'http://fuzd.test',
		chainId: 31337,
		maxFeePerGasAuthorized: GWEI,
		expiryDelta: 10,
		signerKey: () => KEY,
		balanceOf: async () => overrides?.balance ?? 0n,
		createClient: (config) => {
			stub.calls.created.push(config);
			return stub.client;
		},
		now: () => 1_799_999_000,
		...overrides,
	});
}

const BATCH_COST = 3n * 600_000n * GWEI;

describe('the payment (P5)', () => {
	it("is the batch's cost less the free balance, never negative, never more than the batch", () => {
		const pay = (balance: bigint, amountReserved = 0n) =>
			paymentFor({totalMaxCost: 100n, amountReserved, balance});
		expect(pay(0n)).toBe(100n);
		expect(pay(40n)).toBe(60n);
		expect(pay(100n)).toBe(0n);
		expect(pay(250n)).toBe(0n);
		// Held but reserved for other slots is not free.
		expect(pay(140n, 100n)).toBe(60n);
		// Over-reserved: still only this batch.
		expect(pay(10n, 500n)).toBe(100n);
	});

	it("pays the batch's worst cost to the remote account, an unfunded one", async () => {
		const stub = stubClient();
		const payment = await schedulerWith(stub).prepare(request());
		expect(payment).toEqual({payee: REMOTE.toLowerCase(), value: BATCH_COST});
		// Each transaction's gas, the deployment's declared reveal gas, at the
		// chain's expectedWorstGasPrice, in this turn's slot.
		expect(stub.calls.balanceRequired[0]).toEqual({
			maxFeePerGasAuthorized: GWEI,
			transactions: TRANSACTIONS.map((t) => ({gas: t.gas})),
			chainId: '31337',
			slot: 'cycle_7_0x00000000000000000000000000000000000000c0',
		});
	});

	it('pays only the difference to a remote account already holding some', async () => {
		const stub = stubClient();
		const payment = await schedulerWith(stub, {
			balance: BATCH_COST - 5n,
		}).prepare(request());
		expect(payment.value).toBe(5n);
	});

	it('pays nothing to a remote account already funded beyond its reservations', async () => {
		const stub = stubClient({reservedForOtherSlots: 1000n});
		const payment = await schedulerWith(stub, {
			balance: BATCH_COST + 1000n + 1n,
		}).prepare(request());
		expect(payment.value).toBe(0n);
	});

	it('pays no more than this reveal requires, even to an over-reserved remote account', async () => {
		// fuzd holds 1000 reserved for this account's other slots and it holds
		// only 400: this turn pays for its own batch, not for the others.
		const stub = stubClient({reservedForOtherSlots: 1000n});
		const payment = await schedulerWith(stub, {balance: 400n}).prepare(
			request(),
		);
		expect(payment.value).toBe(BATCH_COST);
	});

	it("counts only the balance beyond the account's other reservations", async () => {
		// 1000 reserved, 1300 held: 300 is free, so the batch needs 300 less.
		const stub = stubClient({reservedForOtherSlots: 1000n});
		const payment = await schedulerWith(stub, {balance: 1300n}).prepare(
			request(),
		);
		expect(payment.value).toBe(BATCH_COST - 300n);
	});
});

describe('the schedule (P4 to P6)', () => {
	async function prepared(
		stub: ReturnType<typeof stubClient>,
		params?: Partial<FuzdSchedulerParams>,
	) {
		const scheduler = schedulerWith(stub, params);
		const payment = await scheduler.prepare(request());
		const extensions = await scheduler.submit({
			...request(),
			commitTransaction: '0xc0',
			payment,
		});
		return {payment, extensions};
	}

	it('is the whole reveal as ONE batch, in order, fixed at revealDueAt with the phase as expiry', async () => {
		const stub = stubClient();
		await prepared(stub);
		expect(stub.calls.scheduled).toHaveLength(1);
		const submission = stub.calls.scheduled[0];
		expect(submission.transactions).toEqual(
			TRANSACTIONS.map((t) => ({to: t.to, data: t.data, gas: t.gas})),
		);
		expect(submission.timing).toEqual({
			type: 'fixed-time',
			scheduledTime: 1_800_000_000,
			expiryDelta: 10,
		});
		expect(submission.slot).toBe(
			'cycle_7_0x00000000000000000000000000000000000000c0',
		);
		expect(submission.chainId).toBe('31337');
		expect(submission.maxFeePerGasAuthorized).toBe(GWEI);
		// Reserved against the remote account, for later schedules to count.
		expect(submission.paymentReserve).toEqual({
			amount: BATCH_COST,
			broadcaster: REMOTE.toLowerCase(),
		});
	});

	it('is in clear on the local chain (31337), and timelocked on any other', async () => {
		const local = stubClient();
		await prepared(local);
		expect(local.calls.scheduled[0].inClear).toBe(true);

		const remote = stubClient();
		await prepared(remote, {chainId: 8453});
		expect(remote.calls.scheduled[0].inClear).toBe(false);
		expect(remote.calls.scheduled[0].chainId).toBe('8453');
	});

	it('takes one slot per cycle AND game contract, fuzd keying it by chain and signer', () => {
		// The same key playing two games on one chain in one cycle must not have
		// the second schedule replace the first.
		expect(slotFor(0, GAME)).toBe(
			'cycle_0_0x00000000000000000000000000000000000000c0',
		);
		expect(slotFor(12, '0x00000000000000000000000000000000000000AB')).toBe(
			'cycle_12_0x00000000000000000000000000000000000000ab',
		);
	});

	it('records the schedule under its namespace, with what the status routes are keyed by', async () => {
		const stub = stubClient();
		const {extensions} = await prepared(stub);
		expect(extensions).toEqual({
			fuzd: {
				chainId: '31337',
				account: SIGNER,
				remoteAccount: REMOTE.toLowerCase(),
				slot: 'cycle_7_0x00000000000000000000000000000000000000c0',
				cycleNumber: 7,
				batchSize: 3,
				scheduledAt: 1_799_999_000,
				revealDueAt: 1_800_000_000,
				expiryDelta: 10,
				inClear: true,
			},
		});
	});

	it('signs with the browser key, one client per key', async () => {
		const stub = stubClient();
		let key: `0x${string}` = KEY;
		const scheduler = schedulerWith(stub, {signerKey: () => key});
		await scheduler.prepare(request());
		await scheduler.prepare(request());
		expect(stub.calls.created).toHaveLength(1);
		expect(stub.calls.created[0]).toMatchObject({
			privateKey: KEY,
			schedulerEndPoint: 'http://fuzd.test',
		});
		key = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
		await scheduler.prepare(request());
		expect(stub.calls.created).toHaveLength(2);
	});

	it('is timelocked to drand for real: the payload decrypts back to the batch, in order', async () => {
		const drand = createFakeDrand();
		const sent: {body: string; signature: string}[] = [];
		const realFetch = globalThis.fetch;
		// fuzd's client asks for the remote account over HTTP even when the
		// schedule itself goes to a function: answer it here, offline.
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					success: true,
					account: {
						address: REMOTE,
						serviceParameters: {
							derivationParameters: {type: 'ethereum', data: 'xpub'},
							fees: {fixed: '0', per_1_000_000: 0},
						},
					},
				}),
			)) as typeof fetch;
		try {
			const scheduler = createFuzdScheduler<`0x${string}`>({
				schedulerEndPoint: () => 'http://fuzd.test',
				chainId: 8453,
				maxFeePerGasAuthorized: GWEI,
				expiryDelta: 3600,
				signerKey: () => KEY,
				balanceOf: async () => 0n,
				drand,
				createClient: (config) => {
					const real = createClient({
						privateKey: config.privateKey,
						drand: config.drand,
						schedulerEndPoint: async (body, signature) => {
							sent.push({body, signature});
							const parsed = JSON.parse(body);
							return {
								chainId: parsed.chainId,
								account: SIGNER,
								slot: parsed.slot,
								checkinTime: 1,
							};
						},
					});
					return {
						...real,
						// No reservations route offline: fuzd's arithmetic over the batch.
						computeBalanceRequired: async (params) => {
							const totalMaxCost = real.computeTotalMaxCost(params);
							return {
								amountReserved: 0n,
								totalMaxCost,
								balanceRequired: totalMaxCost,
							};
						},
					};
				},
			});
			const info = await drand.chain().info();
			const revealDueAt = info.genesis_time + info.period * 100;
			const payment = await scheduler.prepare(request({revealDueAt}));
			const extensions = await scheduler.submit({
				...request({revealDueAt}),
				commitTransaction: '0xc0',
				payment,
			});
			expect(extensions.fuzd?.inClear).toBe(false);

			expect(sent).toHaveLength(1);
			const scheduled = JSON.parse(sent[0].body);
			expect(scheduled.type).toBe('time-locked');
			expect(scheduled.executions).toBeUndefined();
			// Nothing of the reveal is readable before its round.
			for (const t of TRANSACTIONS) {
				expect(sent[0].body.includes(`"data":"${t.data}"`)).toBe(false);
			}
			expect(scheduled.timing).toEqual({
				type: 'fixed-time',
				scheduledTime: revealDueAt,
				expiryDelta: 3600,
			});

			// Locked to the round of the reveal's due time.
			const round = roundAt(revealDueAt * 1000, info);
			const asked: number[] = [];
			const recording = {
				...(drand as unknown as Record<string, unknown>),
				get: (r: number) => {
					asked.push(r);
					return drand.get(r);
				},
			} as unknown as typeof drand;
			const clear = JSON.parse(
				(await timelockDecrypt(scheduled.payload, recording)).toString('utf-8'),
			);
			expect(asked).toEqual([round]);
			expect(clear.type).toBe('clear');
			expect(
				clear.executions.map(
					(e: {transaction: {data: string; gas: string; to: string}}) =>
						e.transaction,
				),
			).toEqual(
				TRANSACTIONS.map((t) => ({
					type: '0x2',
					to: t.to,
					data: t.data,
					gas: `0x${t.gas.toString(16)}`,
				})),
			);
		} finally {
			globalThis.fetch = realFetch;
		}
	});
});

describe('when there is nothing to schedule with (R2)', () => {
	it('refuses to prepare without a signing key or an endpoint', async () => {
		const stub = stubClient();
		await expect(
			schedulerWith(stub, {signerKey: () => undefined}).prepare(request()),
		).rejects.toThrow(/signing key/);
		await expect(
			schedulerWith(stub, {schedulerEndPoint: () => undefined}).prepare(
				request(),
			),
		).rejects.toThrow(/endpoint/);
		expect(stub.calls.created).toHaveLength(0);
	});

	it('fails each half when fuzd does, so the adapter records the turn unscheduled', async () => {
		await expect(
			schedulerWith(stubClient({fail: 'assign'})).prepare(request()),
		).rejects.toThrow();
		await expect(
			schedulerWith(stubClient({fail: 'balance'})).prepare(request()),
		).rejects.toThrow();
		for (const fail of ['schedule', 'refuse'] as const) {
			const scheduler = schedulerWith(stubClient({fail}));
			await expect(
				scheduler.submit({
					...request(),
					commitTransaction: '0xc0',
					payment: {payee: REMOTE, value: 1n},
				}),
			).rejects.toThrow();
		}
	});

	it('gives up on a fuzd that does not answer, inside its bound', async () => {
		const stub = stubClient();
		stub.client.assignRemoteAccount = () => new Promise(() => {});
		await expect(
			schedulerWith(stub, {timeouts: {prepare: 20}}).prepare(request()),
		).rejects.toThrow(/timed out/);
	});
});

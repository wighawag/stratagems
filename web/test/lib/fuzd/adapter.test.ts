import {describe, expect, it} from 'vitest';
import {readable, writable} from 'svelte/store';
import {zeroAddress} from 'viem';
import {createCommitRevealContractAdapter} from '$lib/game/core/commit-reveal/adapter';
import type {ActionEncoding} from '$lib/game/core/commit-reveal/contract';
import {
	createFuzdScheduler,
	type FuzdClientLike,
	type FuzdExtensions,
} from '$lib/fuzd';

/**
 * The layer's scheduler through the framework's REAL adapter: what reaches the
 * commit, and that fuzd failing at either half leaves the commit standing and
 * the turn recorded as not scheduled (R2). fuzd's client is stubbed; the chain
 * is a fake that records sends.
 */
type Move = {position: bigint};
const MOVE: ActionEncoding = {components: [{name: 'position', type: 'uint64'}]};
const SIGNER = '0x2222222222222222222222222222222222222222' as const;
const KEY =
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const REMOTE = '0x00000000000000000000000000000000000000fe' as const;
const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000aa' as const;
const contract = {
	address: '0x00000000000000000000000000000000000000c0',
	abi: [
		{
			type: 'function',
			name: 'reveal',
			stateMutability: 'payable',
			inputs: [
				{name: 'player', type: 'uint256'},
				{name: 'moves', type: 'tuple[]', components: MOVE.components},
				{name: 'secret', type: 'bytes32'},
				{name: 'furtherActions', type: 'bytes24'},
				{name: 'payee', type: 'address'},
			],
			outputs: [],
		},
	],
} as never;

function fakeChain() {
	const sends: {
		functionName: string;
		args: readonly unknown[];
		value?: bigint;
	}[] = [];
	const deps = {
		connection: {ensureConnected: async () => {}} as never,
		signerExecutor: writable({
			status: 'ready',
			address: SIGNER,
			account: SIGNER,
			client: {
				writeContract: async (request: never) => {
					sends.push(request);
					return '0xtx' as `0x${string}`;
				},
			},
		}) as unknown as never,
		deployments: readable({}) as never,
		signerBalance: writable({step: 'Loaded', value: 10n ** 18n}) as never,
		publicClient: {
			readContract: async () => 10n,
			waitForTransactionReceipt: async () => ({status: 'success'}),
		} as never,
	};
	return {deps, sends};
}

function stub(fail?: 'prepare' | 'submit'): FuzdClientLike {
	return {
		async assignRemoteAccount() {
			if (fail === 'prepare') throw new Error('fuzd down');
			return {address: REMOTE} as never;
		},
		computeTotalMaxCost: () => 30n,
		async computeBalanceRequired() {
			return {amountReserved: 0n, totalMaxCost: 30n, balanceRequired: 30n};
		},
		async scheduleExecution(submission) {
			if (fail === 'submit') return {success: false, error: 'refused'};
			return {
				success: true,
				info: {
					chainId: submission.chainId,
					account: SIGNER,
					slot: submission.slot,
					checkinTime: 1,
				},
			};
		},
	};
}

async function commitWith(fail?: 'prepare' | 'submit') {
	const chain = fakeChain();
	const adapter = createCommitRevealContractAdapter<bigint, Move>({
		deps: chain.deps,
		contract,
		encoding: MOVE,
		onchainIdentity: (token) => token,
		actionsPerReveal: 2,
		gas: {commit: 11n, reveal: 22n},
		revealPhaseDuration: 10,
		bondFor: () => 1n,
	});
	const scheduler = createFuzdScheduler<bigint>({
		schedulerEndPoint: () => 'http://fuzd.test',
		chainId: 31337,
		maxFeePerGasAuthorized: 1n,
		expiryDelta: 10,
		signerKey: () => KEY,
		balanceOf: async () => 0n,
		createClient: () => stub(fail),
	});
	const actions = [{position: 1n}, {position: 2n}, {position: 3n}];
	const {hash} = adapter.buildCommitment({actions, secret: SECRET});
	const outcome = await adapter.commit<FuzdExtensions>({
		identity: 7n,
		hash,
		actions,
		secret: SECRET,
		cycleNumber: 3,
		revealDueAt: 1234,
		scheduler,
	});
	return {outcome, sends: chain.sends};
}

describe('the fuzd scheduler, through the commit-reveal adapter', () => {
	it('pays the remote account in the commit and records the schedule', async () => {
		const {outcome, sends} = await commitWith();
		expect(sends).toHaveLength(1);
		expect(sends[0].functionName).toBe('makeCommitment');
		expect(sends[0].args[3]).toBe(REMOTE);
		expect(sends[0].value).toBe(30n);
		expect(outcome.revealScheduled).toBe(true);
		expect(outcome.extensions?.fuzd).toMatchObject({
			slot: 'cycle_3_0x00000000000000000000000000000000000000c0',
			batchSize: 2,
		});
	});

	it('commits unpaid and unscheduled when prepare fails', async () => {
		const {outcome, sends} = await commitWith('prepare');
		expect(sends.map((s) => s.functionName)).toEqual(['makeCommitment']);
		expect(sends[0].args[3]).toBe(zeroAddress);
		expect(sends[0].value).toBeUndefined();
		expect(outcome).toEqual({hash: '0xtx', revealScheduled: false});
	});

	it('leaves the paid commit standing, unscheduled, when submit fails', async () => {
		const {outcome, sends} = await commitWith('submit');
		expect(sends.map((s) => s.functionName)).toEqual(['makeCommitment']);
		expect(sends[0].value).toBe(30n);
		expect(outcome).toEqual({hash: '0xtx', revealScheduled: false});
	});
});

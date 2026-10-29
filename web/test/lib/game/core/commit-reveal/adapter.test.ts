import {describe, expect, it} from 'vitest';
import {readable, writable} from 'svelte/store';
import {decodeFunctionData, zeroAddress} from 'viem';
import {createCommitRevealContractAdapter} from '$lib/game/core/commit-reveal/adapter';
import type {RevealScheduler} from '$lib/game/core/seams';
import {
	buildCommitmentChain,
	NO_FURTHER_ACTIONS,
} from '$lib/game/core/commit-reveal/chain';
import {createMissedReveal} from '$lib/game/core/commit-reveal/missed-reveal';
import type {ActionEncoding} from '$lib/game/core/commit-reveal/contract';

/**
 * The base's client for a game that is NOT the reference game: a token
 * identity (a `bigint`, spelled on chain as itself) and a two-field move. What
 * is pinned is that what reaches the contract is the game's: its contract,
 * its identity's spelling, its actions as its struct, its bond, its penalty.
 * The reference game's own suites pin the rest through its bindings.
 */
type Move = {position: bigint; color: number};
const MOVE: ActionEncoding = {
	components: [
		{name: 'position', type: 'uint64'},
		{name: 'color', type: 'uint8'},
	],
};

const TOKEN = 7n;
const SIGNER = '0x2222222222222222222222222222222222222222' as const;
const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000aa' as const;
/** The base's reveal, with this game's move as the action struct. */
const REVEAL_ABI = [
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
] as const;
const contract = {
	address: '0x00000000000000000000000000000000000000c0',
	abi: REVEAL_ABI,
} as never;

function fakeDeps(onChain: {
	commitment?: {hash: `0x${string}`; cycleNumber: bigint; bond: bigint};
	currentCycleNumber?: bigint;
	reserve?: bigint;
}) {
	const sends: {
		address: string;
		functionName: string;
		args: readonly unknown[];
		gas?: bigint;
		value?: bigint;
	}[] = [];
	/** Everything the test can see happen, in order. */
	const log: string[] = [];
	const reads: {functionName: string; args?: readonly unknown[]}[] = [];
	const deps = {
		connection: {ensureConnected: async () => {}} as never,
		signerExecutor: writable({
			status: 'ready',
			address: SIGNER,
			account: SIGNER,
			client: {
				writeContract: async (request: never) => {
					sends.push(request);
					log.push(`send ${(request as {functionName: string}).functionName}`);
					return '0xtx' as `0x${string}`;
				},
			},
		}) as unknown as never,
		deployments: readable({}) as never,
		signerBalance: writable({step: 'Loaded', value: 10n ** 18n}) as never,
		publicClient: {
			readContract: async (request: {
				functionName: string;
				args?: readonly unknown[];
			}) => {
				reads.push(request);
				if (request.functionName === 'getReserve') return onChain.reserve ?? 0n;
				if (request.functionName === 'getCommitment') return onChain.commitment;
				if (request.functionName === 'getCycleNumber')
					return [onChain.currentCycleNumber, false];
				throw new Error(`unexpected read ${request.functionName}`);
			},
			waitForTransactionReceipt: async () => {
				log.push('receipt');
				return {status: 'success'};
			},
		} as never,
	};
	return {deps, sends, reads, log};
}

function adapterFor(deps: ReturnType<typeof fakeDeps>['deps']) {
	return createCommitRevealContractAdapter<bigint, Move>({
		deps,
		contract,
		encoding: MOVE,
		onchainIdentity: (token) => token,
		actionsPerReveal: 2,
		gas: {commit: 11n, reveal: 22n},
		revealPhaseDuration: 10,
		// The game's bond policy: one unit per move, capped at the reserve.
		bondFor: (actions, reserve) =>
			BigInt(actions.length) < reserve ? BigInt(actions.length) : reserve,
	});
}

const turn: Move[] = [
	{position: 1n, color: 1},
	{position: 2n, color: 2},
	{position: 3n, color: 3},
];

describe("the base's adapter, for a token-keyed game with its own action", () => {
	it('commits under the token, with the bond the game chose', async () => {
		const {deps, sends, reads} = fakeDeps({reserve: 10n});
		const adapter = adapterFor(deps);
		const {hash} = adapter.buildCommitment({actions: turn, secret: SECRET});
		await adapter.commit({
			identity: TOKEN,
			hash,
			actions: turn,
			secret: SECRET,
			cycleNumber: 1,
		});

		expect(reads).toHaveLength(1);
		expect(reads[0]).toMatchObject({functionName: 'getReserve', args: [TOKEN]});
		expect(sends).toHaveLength(1);
		expect(sends[0]).toMatchObject({
			address: (contract as {address: string}).address,
			functionName: 'makeCommitment',
			gas: 11n,
		});
		expect(sends[0].args.slice(0, 3)).toEqual([TOKEN, hash, 3n]);
	});

	it("reveals the chain from the head the contract holds, as the game's struct", async () => {
		const chain = buildCommitmentChain({
			actions: turn,
			secret: SECRET,
			actionsPerReveal: 2,
			encoding: MOVE,
		});
		// The first chunk already landed: the head is the second one's.
		const {deps, sends} = fakeDeps({
			commitment: {hash: chain[1].hash, cycleNumber: 1n, bond: 3n},
		});
		const progress: {done: number; total: number}[] = [];
		await adapterFor(deps).reveal({
			identity: TOKEN,
			actions: turn,
			secret: SECRET,
			cycleNumber: 1,
			onProgress: (p: {done: number; total: number}) => void progress.push(p),
		} as never);

		expect(sends).toHaveLength(1);
		expect(sends[0].functionName).toBe('reveal');
		expect(sends[0].gas).toBe(22n);
		expect(sends[0].args.slice(0, 4)).toEqual([
			TOKEN,
			[{position: 3n, color: 3}],
			SECRET,
			NO_FURTHER_ACTIONS,
		]);
		expect(progress).toEqual([
			{done: 1, total: 2},
			{done: 2, total: 2},
		]);
	});
});

describe("the base's missed-reveal settlement, for that game", () => {
	it("settles shown the chunks, charging the game's penalty", async () => {
		const chain = buildCommitmentChain({
			actions: turn,
			secret: SECRET,
			actionsPerReveal: 2,
			encoding: MOVE,
		});
		const {deps, sends} = fakeDeps({
			commitment: {hash: chain[0].hash, cycleNumber: 4n, bond: 100n},
			currentCycleNumber: 6n,
		});
		const store = createMissedReveal<bigint, Move>({
			deps,
			contract,
			encoding: MOVE,
			onchainIdentity: (token) => token,
			actionsPerReveal: 2,
			// A penalty that is not the cost of anything: the game's own.
			penaltyFor: (count) => 5n * BigInt(count),
			identity: writable<bigint | undefined>(TOKEN),
			committedTurn: () => ({
				cycleNumber: 4,
				actions: turn,
				secret: SECRET,
				committed: true,
			}),
		});
		await store.check();
		expect(store.value).toEqual({
			step: 'Blocked',
			cycleNumber: 4,
			bond: 100n,
			forfeit: 15n,
		});

		await store.acknowledge();
		expect(sends.map((s) => s.functionName)).toEqual([
			'acknowledgeMissedReveal',
			'acknowledgeMissedReveal',
		]);
		expect(sends[1].args).toEqual([
			TOKEN,
			[{position: 3n, color: 3}],
			SECRET,
			NO_FURTHER_ACTIONS,
		]);
		expect(store.value).toEqual({step: 'Clear'});
	});
});

describe("the base's adapter, with a reveal scheduler (P3)", () => {
	const PAYEE = '0x00000000000000000000000000000000000000fe' as const;
	type Extensions = {test?: {slot: string}};

	function scheduler(overrides?: {
		prepare?: RevealScheduler<bigint, Extensions>['prepare'];
		submit?: RevealScheduler<bigint, Extensions>['submit'];
		log?: string[];
	}) {
		const calls = {
			prepare: [] as Parameters<
				RevealScheduler<bigint, Extensions>['prepare']
			>[0][],
			submit: [] as Parameters<
				RevealScheduler<bigint, Extensions>['submit']
			>[0][],
		};
		const scheduler: RevealScheduler<bigint, Extensions> = {
			async prepare(request) {
				calls.prepare.push(request);
				overrides?.log?.push('prepare');
				return overrides?.prepare
					? overrides.prepare(request)
					: {payee: PAYEE, value: 5n};
			},
			async submit(request) {
				calls.submit.push(request);
				overrides?.log?.push('submit');
				return overrides?.submit
					? overrides.submit(request)
					: {test: {slot: `cycle_${request.cycleNumber}`}};
			},
		};
		return {scheduler, calls};
	}

	async function commitWith(
		s: RevealScheduler<bigint, Extensions>,
		fake: ReturnType<typeof fakeDeps>,
		// A manually advanced chain has no reveal time: `null` says so here,
		// because a default parameter would swallow an explicit `undefined`.
		revealDueAt: number | null = 1234,
	) {
		const adapter = adapterFor(fake.deps);
		const {hash} = adapter.buildCommitment({actions: turn, secret: SECRET});
		return adapter.commit<Extensions>({
			identity: TOKEN,
			hash,
			actions: turn,
			secret: SECRET,
			cycleNumber: 3,
			revealDueAt: revealDueAt ?? undefined,
			scheduler: s,
		});
	}

	it('exposes the reveal as one transaction per chunk, in order, nobody paid', () => {
		const {deps} = fakeDeps({});
		const transactions = adapterFor(deps).revealTransactions!({
			identity: TOKEN,
			actions: turn,
			secret: SECRET,
		});
		const chain = buildCommitmentChain({
			actions: turn,
			secret: SECRET,
			actionsPerReveal: 2,
			encoding: MOVE,
		});
		expect(transactions).toHaveLength(2);
		transactions.forEach((transaction, i) => {
			expect(transaction.to).toBe((contract as {address: string}).address);
			expect(transaction.gas).toBe(22n);
			const call = decodeFunctionData({
				abi: REVEAL_ABI,
				data: transaction.data,
			});
			expect(call.functionName).toBe('reveal');
			expect(call.args).toEqual([
				TOKEN,
				chain[i].actions,
				SECRET,
				chain[i].furtherActions,
				zeroAddress,
			]);
		});
	});

	it('asks for the payment before the commit, carries it, and schedules once broadcast', async () => {
		const fake = fakeDeps({reserve: 10n});
		const {scheduler: s, calls} = scheduler({log: fake.log});
		const outcome = await commitWith(s, fake);

		// prepare, then the commit, then the schedule beside the receipt.
		expect(fake.log.indexOf('prepare')).toBeLessThan(
			fake.log.indexOf('send makeCommitment'),
		);
		expect(fake.log.indexOf('send makeCommitment')).toBeLessThan(
			fake.log.indexOf('submit'),
		);

		expect(calls.prepare[0]).toMatchObject({
			identity: TOKEN,
			cycleNumber: 3,
			revealDueAt: 1234,
		});
		expect(calls.prepare[0].transactions).toHaveLength(2);

		const commit = fake.sends.find((x) => x.functionName === 'makeCommitment')!;
		expect(commit.args[3]).toBe(PAYEE);
		expect(commit.value).toBe(5n);

		expect(calls.submit[0]).toMatchObject({
			commitTransaction: '0xtx',
			payment: {payee: PAYEE, value: 5n},
		});
		expect(calls.submit[0].transactions).toEqual(calls.prepare[0].transactions);
		expect(outcome).toEqual({
			hash: '0xtx',
			revealScheduled: true,
			extensions: {test: {slot: 'cycle_3'}},
		});
	});

	it('commits unpaid and unscheduled when the payment cannot be prepared', async () => {
		const fake = fakeDeps({reserve: 10n});
		const {scheduler: s, calls} = scheduler({
			prepare: async () => {
				throw new Error('service down');
			},
		});
		const outcome = await commitWith(s, fake);
		const commit = fake.sends.find((x) => x.functionName === 'makeCommitment')!;
		expect(commit.args[3]).toBe(zeroAddress);
		expect(commit.value).toBeUndefined();
		expect(calls.submit).toHaveLength(0);
		expect(outcome).toEqual({hash: '0xtx', revealScheduled: false});
	});

	it('leaves the commit standing, unscheduled, when the schedule fails', async () => {
		const fake = fakeDeps({reserve: 10n});
		const {scheduler: s} = scheduler({
			submit: async () => {
				throw new Error('rejected');
			},
		});
		const outcome = await commitWith(s, fake);
		expect(fake.sends.map((x) => x.functionName)).toEqual(['makeCommitment']);
		expect(outcome).toEqual({hash: '0xtx', revealScheduled: false});
	});

	it('asks nothing on a chain with no reveal time to schedule for', async () => {
		const fake = fakeDeps({reserve: 10n});
		const {scheduler: s, calls} = scheduler();
		const outcome = await commitWith(s, fake, null);
		expect(calls.prepare).toHaveLength(0);
		expect(calls.submit).toHaveLength(0);
		expect(fake.sends[0].args[3]).toBe(zeroAddress);
		expect(outcome).toEqual({hash: '0xtx', revealScheduled: false});
	});

	it('passes zero and no value, as before, when there is no scheduler', async () => {
		const fake = fakeDeps({reserve: 10n});
		const adapter = adapterFor(fake.deps);
		const {hash} = adapter.buildCommitment({actions: turn, secret: SECRET});
		const outcome = await adapter.commit({
			identity: TOKEN,
			hash,
			actions: turn,
			secret: SECRET,
			cycleNumber: 3,
			revealDueAt: 1234,
		});
		expect(fake.sends[0].args[3]).toBe(zeroAddress);
		expect(fake.sends[0].value).toBeUndefined();
		expect(outcome).toEqual({hash: '0xtx'});
	});
});

describe("the base's adapter, when somebody else revealed (P9)", () => {
	const chain = buildCommitmentChain({
		actions: turn,
		secret: SECRET,
		actionsPerReveal: 2,
		encoding: MOVE,
	});
	const last = chain[chain.length - 1].hash;

	it('reports a turn the chain has closed on its last chunk as revealed, sending nothing', async () => {
		// A completed reveal zeroes the cycle and leaves the head at the last
		// chunk it opened: that is what a scheduler's (or anyone's) reveal leaves.
		const {deps, sends} = fakeDeps({
			commitment: {hash: last, cycleNumber: 0n, bond: 0n},
		});
		const outcome = await adapterFor(deps).reveal({
			identity: TOKEN,
			actions: turn,
			secret: SECRET,
		});
		expect(outcome).toEqual({alreadyRevealed: true});
		expect(sends).toHaveLength(0);
	});

	it('still refuses when the chain holds nothing that is this turn', async () => {
		const {deps} = fakeDeps({
			commitment: {hash: chain[0].hash, cycleNumber: 0n, bond: 0n},
		});
		await expect(
			adapterFor(deps).reveal({identity: TOKEN, actions: turn, secret: SECRET}),
		).rejects.toThrow(/no commitment on chain left to reveal/i);
	});

	it("answers what the chain says about this cycle's turn", async () => {
		const ask = (commitment: {
			hash: `0x${string}`;
			cycleNumber: bigint;
			bond: bigint;
		}) =>
			adapterFor(fakeDeps({commitment}).deps).commitmentStatus!({
				identity: TOKEN,
				actions: turn,
				secret: SECRET,
				cycleNumber: 4,
			});
		// Still held for its cycle, from any chunk on: owed.
		expect(await ask({hash: chain[1].hash, cycleNumber: 4n, bond: 1n})).toBe(
			'open',
		);
		// Closed on its last chunk: revealed, by whoever.
		expect(await ask({hash: last, cycleNumber: 0n, bond: 0n})).toBe('revealed');
		// Another turn altogether, or a later cycle's: nothing can be said.
		expect(await ask({hash: chain[0].hash, cycleNumber: 0n, bond: 0n})).toBe(
			'unknown',
		);
		expect(await ask({hash: last, cycleNumber: 5n, bond: 1n})).toBe('unknown');
	});

	it('answers unknown, not revealed, when the read fails', async () => {
		const {deps} = fakeDeps({});
		(deps.publicClient as {readContract: unknown}).readContract = async () => {
			throw new Error('node down');
		};
		expect(
			await adapterFor(deps).commitmentStatus!({
				identity: TOKEN,
				actions: turn,
				secret: SECRET,
				cycleNumber: 4,
			}),
		).toBe('unknown');
	});
});

describe("the base's adapter, recognising its turn at any chunk", () => {
	it('knows every head of the chain as this turn, and nothing else', () => {
		const chain = buildCommitmentChain({
			actions: turn,
			secret: SECRET,
			actionsPerReveal: 2,
			encoding: MOVE,
		});
		const adapter = adapterFor(fakeDeps({}).deps);
		for (const chunk of chain) {
			expect(
				adapter.isHeadOf!({actions: turn, secret: SECRET, head: chunk.hash}),
			).toBe(true);
		}
		expect(
			adapter.isHeadOf!({
				actions: turn,
				secret: SECRET,
				head: `0x${'ee'.repeat(24)}`,
			}),
		).toBe(false);
	});
});

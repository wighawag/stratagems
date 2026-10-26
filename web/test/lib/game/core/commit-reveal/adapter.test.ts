import {describe, expect, it} from 'vitest';
import {readable, writable} from 'svelte/store';
import {createCommitRevealContractAdapter} from '$lib/game/core/commit-reveal/adapter';
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
const contract = {
	address: '0x00000000000000000000000000000000000000c0',
	abi: [],
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
	}[] = [];
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
			waitForTransactionReceipt: async () => ({status: 'success'}),
		} as never,
	};
	return {deps, sends, reads};
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

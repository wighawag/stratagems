import {describe, expect, it, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import {
	blocksCommitting,
	createMissedReveal,
	type MissedRevealState,
} from '$lib/placement/missed-reveal';
import {describeMissedReveal} from '$lib/placement/ui/hud';
import type {GameIdentity} from '$lib/game/identity';
import {
	buildPlacementChain,
	type Placement,
} from '$lib/placement/commit-reveal';

const PLAYER = '0x1111111111111111111111111111111111111111' as const;

/**
 * The chain, reduced to the two reads this store makes.
 *
 * `writes` records every transaction, which is the point of most of these
 * tests: acknowledging forfeits the player's bond, so the interesting assertion
 * is usually that NOTHING was sent.
 */
function fakeDeps(options: {
	commitment: {cycleNumber: bigint; bond: bigint; hash?: `0x${string}`};
	currentCycleNumber: bigint;
	identity?: GameIdentity | undefined;
	writeFails?: boolean;
	readFails?: boolean;
	/** The signer's gas. Zero makes `send()` refuse before it reaches the node. */
	signerBalance?: bigint;
}) {
	const writes: string[] = [];
	const reads: {functionName: string; args?: readonly unknown[]}[] = [];
	const sends: {functionName: string; args?: readonly unknown[]}[] = [];
	const deps = {
		connection: {ensureConnected: async () => {}} as never,
		signerExecutor: writable({
			status: 'ready',
			address: PLAYER,
			account: PLAYER,
			client: {
				writeContract: async (request: {
					functionName: string;
					args?: readonly unknown[];
				}) => {
					sends.push(request);
					if (options.writeFails) throw new Error('user rejected');
					return '0xtx' as `0x${string}`;
				},
			},
		}) as unknown as never,
		deployments: {
			get: () => ({
				contracts: {Game: {address: '0xgame', abi: []}},
			}),
		} as never,
		balanceCheck: {
			ensureCanAfford: async (o: {contract: {functionName: string}}) => {
				return o.contract;
			},
		} as never,
		// Funded unless a test says otherwise. `send()` refuses outright when this
		// reads a loaded zero, because a rejected transaction burns a nonce on the
		// node this game runs against and wedges the signer for good.
		signerBalance: writable({
			step: 'Loaded',
			value: options.signerBalance ?? 10n ** 18n,
		}) as unknown as never,
		publicClient: {
			readContract: async ({
				functionName,
				args,
			}: {
				functionName: string;
				args?: readonly unknown[];
			}) => {
				reads.push({functionName, args});
				if (options.readFails) throw new Error('rpc down');
				if (functionName === 'getCommitment') return options.commitment;
				if (functionName === 'getCycleNumber')
					return [options.currentCycleNumber, true];
				throw new Error(`unexpected read ${functionName}`);
			},
			waitForTransactionReceipt: async () => {
				writes.push('sent');
				return {status: options.writeFails ? 'reverted' : 'success'};
			},
		} as never,
	};
	// WHO PLAYS, which is the account in this game and is not the signer that
	// sends the transaction.
	const identity = writable(
		'identity' in options ? options.identity : PLAYER,
	) as unknown as never;
	return {deps, identity, writes, reads, sends};
}

const config = {placementCost: 10n ** 18n, actionsPerReveal: 2} as never;

describe('a commitment that was never revealed', () => {
	it('is reported, with what it cost, when it is from a past cycle', async () => {
		const {deps, identity} = fakeDeps({
			commitment: {cycleNumber: 10n, bond: 5n * 10n ** 18n},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({deps, config, identity});
		await store.check();

		// With no turn to show, settling takes the whole bond, and it says so.
		expect(store.value).toEqual({
			step: 'Blocked',
			cycleNumber: 10,
			bond: 5n * 10n ** 18n,
			forfeit: 5n * 10n ** 18n,
		});
		expect(blocksCommitting(store.value)).toBe(true);
	});

	it('asks the chain about an identity the contract can key by', async () => {
		// THE ARGUMENT, not just the answer. Every read and write here names the
		// player, and the contract keys players by a `uint256` rather than by an
		// address (`IGame.sol`), so the identity is widened on the way in by
		// `onchainIdentity` in `$lib/game/identity` - the one place that knows how
		// this game's identity is spelled on chain.
		//
		// A `typeof` and not a value, deliberately, so that this survives the
		// cascade into a game whose identity is already a number: there the
		// conversion is the identity itself and there is nothing to compare
		// against. What it catches is the case that exists HERE, an address handed
		// to a `uint256` parameter, which viem rejects at the call and which no
		// other assertion in this file would notice, since they all fake the read.
		const {deps, identity, reads, sends} = fakeDeps({
			commitment: {cycleNumber: 10n, bond: 5n * 10n ** 18n},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({deps, config, identity});
		await store.check();
		await store.acknowledge();

		const commitmentRead = reads.find(
			(r) => r.functionName === 'getCommitment',
		);
		expect(typeof commitmentRead?.args?.[0]).toBe('bigint');

		// And the settlement, which spends the bond, names the same thing.
		const settle = sends.find((s) => s.functionName === 'forfeitMissedReveal');
		expect(typeof settle?.args?.[0]).toBe('bigint');
	});

	it('is NOT settled without the player asking', async () => {
		const {deps, identity, writes} = fakeDeps({
			commitment: {cycleNumber: 10n, bond: 5n * 10n ** 18n},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({deps, config, identity});
		await store.check();

		// Acknowledging forfeits the bond. Merely noticing must never spend it:
		// this was briefly done automatically before a commit, which took the
		// player's money inside an action they thought was about something else.
		expect(writes).toEqual([]);
	});

	it('forfeits the bond only when acknowledged, and then unblocks play', async () => {
		const {deps, identity, writes} = fakeDeps({
			commitment: {cycleNumber: 10n, bond: 5n * 10n ** 18n},
			currentCycleNumber: 12n,
		});
		const onSettled = vi.fn();
		const store = createMissedReveal({deps, config, identity, onSettled});
		await store.check();

		await store.acknowledge();

		expect(writes).toEqual(['sent']);
		expect(store.value.step).toBe('Clear');
		expect(blocksCommitting(store.value)).toBe(false);
		// The forfeit comes out of the reserve, so the caller re-reads it.
		expect(onSettled).toHaveBeenCalledOnce();
	});

	it('leaves a commitment for the CURRENT cycle alone', async () => {
		const {deps, identity, writes} = fakeDeps({
			commitment: {cycleNumber: 12n, bond: 5n * 10n ** 18n},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({deps, config, identity});
		await store.check();

		// It can still be revealed. Acknowledging it would revert with
		// `CanStillReveal`, and would be destroying a stake that is not yet lost.
		expect(store.value.step).toBe('Clear');
		await store.acknowledge();
		expect(writes).toEqual([]);
	});

	it('reports nothing when there is no commitment at all', async () => {
		const {deps, identity} = fakeDeps({
			commitment: {cycleNumber: 0n, bond: 0n},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({deps, config, identity});
		await store.check();
		expect(store.value.step).toBe('Clear');
	});

	it('does not claim a stake was lost because a read failed', async () => {
		const {deps, identity} = fakeDeps({
			commitment: {cycleNumber: 0n, bond: 0n},
			currentCycleNumber: 12n,
			readFails: true,
		});
		const store = createMissedReveal({deps, config, identity});
		await store.check();

		// Telling someone they have forfeited a stake is not something to do on
		// the strength of one RPC call that did not come back.
		expect(store.value.step).toBe('Unknown');
	});

	it('keeps the notice up when acknowledging fails, so it can be retried', async () => {
		const {deps, identity} = fakeDeps({
			commitment: {cycleNumber: 10n, bond: 5n * 10n ** 18n},
			currentCycleNumber: 12n,
			writeFails: true,
		});
		const store = createMissedReveal({deps, config, identity});
		await store.check();
		await store.acknowledge();

		expect(store.value.step).toBe('Failed');
		expect(blocksCommitting(store.value)).toBe(true);
		expect(get(store)).toBe(store.value);
	});
});

describe('a missed reveal this browser can still show', () => {
	const SECRET = `0x${'5e'.repeat(32)}` as const;
	const turn: Placement[] = [{cellID: 1n}, {cellID: 2n}, {cellID: 3n}];
	const chain = buildPlacementChain({
		actions: turn,
		secret: SECRET,
		actionsPerReveal: 2,
	});

	it('settles WITH the chunks, forfeiting only what the placements cost', async () => {
		const {deps, identity, sends} = fakeDeps({
			commitment: {
				cycleNumber: 10n,
				bond: 4n * 10n ** 18n,
				hash: chain[0].hash,
			},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({
			deps,
			config,
			identity,
			committedTurn: () => ({
				cycleNumber: 10,
				actions: turn,
				secret: SECRET,
				committed: true,
			}),
		});
		await store.check();
		// Three placements of the four bonded: one comes back.
		expect(store.value).toEqual({
			step: 'Blocked',
			cycleNumber: 10,
			bond: 4n * 10n ** 18n,
			forfeit: 3n * 10n ** 18n,
		});

		await store.acknowledge();
		expect(sends.map((s) => s.functionName)).toEqual([
			'acknowledgeMissedReveal',
			'acknowledgeMissedReveal',
		]);
		// Each call carries one chunk exactly as a reveal would.
		expect(sends[0].args?.[1]).toEqual(chain[0].actions);
		expect(sends[0].args?.[2]).toBe(SECRET);
		expect(sends[1].args?.[3]).toBe(chain[1].furtherActions);
		expect(store.value.step).toBe('Clear');
	});

	it('resumes from the head the chain holds, not from the start', async () => {
		const {deps, identity, sends} = fakeDeps({
			commitment: {
				cycleNumber: 10n,
				bond: 2n * 10n ** 18n,
				hash: chain[1].hash,
			},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({
			deps,
			config,
			identity,
			committedTurn: () => ({
				cycleNumber: 10,
				actions: turn,
				secret: SECRET,
				committed: true,
			}),
		});
		await store.check();
		expect(store.value.step === 'Blocked' && store.value.forfeit).toBe(
			10n ** 18n,
		);
		await store.acknowledge();
		expect(sends.length).toBe(1);
		expect(sends[0].args?.[1]).toEqual(chain[1].actions);
	});

	it('forfeits the whole bond when the record is not the turn the chain holds', async () => {
		const {deps, identity, sends} = fakeDeps({
			commitment: {
				cycleNumber: 10n,
				bond: 4n * 10n ** 18n,
				hash: `0x${'ab'.repeat(24)}`,
			},
			currentCycleNumber: 12n,
		});
		const store = createMissedReveal({
			deps,
			config,
			identity,
			committedTurn: () => ({
				cycleNumber: 10,
				actions: turn,
				secret: SECRET,
				committed: true,
			}),
		});
		await store.check();
		expect(store.value.step === 'Blocked' && store.value.forfeit).toBe(
			4n * 10n ** 18n,
		);
		await store.acknowledge();
		expect(sends.map((s) => s.functionName)).toEqual(['forfeitMissedReveal']);
	});
});

describe('what the player is told', () => {
	it('says what was lost and what to do about it', () => {
		const described = describeMissedReveal({
			step: 'Blocked',
			cycleNumber: 10,
			bond: 8n * 10n ** 18n,
			forfeit: 5n * 10n ** 18n,
		});
		expect(described?.headline).toContain('cycle 10');
		// What SETTLING takes, not the bond: the rest comes back.
		expect(described?.detail).toContain('5 TOK');
		expect(described?.canAcknowledge).toBe(true);
	});

	it('says nothing at all when there is nothing to settle', () => {
		for (const state of [
			{step: 'Clear'},
			{step: 'Unknown'},
		] satisfies MissedRevealState[]) {
			expect(describeMissedReveal(state)).toBeUndefined();
		}
	});
});

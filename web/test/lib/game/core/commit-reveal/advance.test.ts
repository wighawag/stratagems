import {describe, expect, it} from 'vitest';
import {writable} from 'svelte/store';
import {
	createAttendanceReader,
	createCycleAdvancer,
} from '$lib/game/core/commit-reveal/advance';

const SIGNER = '0x2222222222222222222222222222222222222222' as const;

/** The chain, reduced to the one read and the one write this file makes. */
function fakeDeps(options?: {
	attendance?: {waitedFor: bigint; committed: bigint; revealed: bigint};
	noSigner?: boolean;
	reverts?: boolean;
	signerBalance?: bigint;
}) {
	const sends: {functionName: string; args?: readonly unknown[]}[] = [];
	const reads: string[] = [];
	const deployments = {
		get: () => ({contracts: {Game: {address: '0xgame', abi: []}}}),
	};
	// Any game's contract: the base's calls are the same in all of them.
	const contract = {address: '0xgame', abi: []} as never;
	const deps = {
		connection: {ensureConnected: async () => {}} as never,
		signerExecutor: writable(
			options?.noSigner
				? {status: 'not-ready'}
				: {
						status: 'ready',
						address: SIGNER,
						account: SIGNER,
						client: {
							writeContract: async (request: {
								functionName: string;
								args?: readonly unknown[];
							}) => {
								sends.push(request);
								return '0xtx' as `0x${string}`;
							},
						},
					},
		) as unknown as never,
		deployments: deployments as never,
		signerBalance: writable({
			step: 'Loaded',
			value: options?.signerBalance ?? 10n ** 18n,
		}) as unknown as never,
		publicClient: {
			readContract: async ({functionName}: {functionName: string}) => {
				reads.push(functionName);
				if (functionName === 'getAttendance') {
					return (
						options?.attendance ?? {
							waitedFor: 2n,
							committed: 1n,
							revealed: 0n,
						}
					);
				}
				throw new Error(`unexpected read ${functionName}`);
			},
			waitForTransactionReceipt: async () => ({
				status: options?.reverts ? 'reverted' : 'success',
			}),
		} as never,
	};
	return {deps, sends, reads, contract};
}

describe('the attendance reader', () => {
	it('reads the tally the cycle is judged by, as numbers', async () => {
		const {deps, contract} = fakeDeps({
			attendance: {waitedFor: 3n, committed: 2n, revealed: 1n},
		});
		const read = createAttendanceReader({
			publicClient: deps.publicClient,
			contract,
		});
		// `uint64`s come back as bigints and the framework's arithmetic is in
		// numbers. A count of members is nowhere near the safe-integer boundary,
		// which is why this conversion is allowed to be silent here and is not
		// allowed to be silent for a balance.
		await expect(read()).resolves.toEqual({
			waitedFor: 3,
			committed: 2,
			revealed: 1,
		});
	});
});

describe('the cycle advancer', () => {
	it('sends advanceCycle from the signer, with no arguments', async () => {
		const {deps, sends, contract} = fakeDeps();
		await createCycleAdvancer({deps, contract})();

		expect(sends).toHaveLength(1);
		expect(sends[0].functionName).toBe('advanceCycle');
		// TAKES NOTHING. It is nobody's move: there is no player to name, and
		// naming one would be the beginning of making it one.
		expect(sends[0].args).toEqual([]);
	});

	it('waits for inclusion and refuses a revert', async () => {
		// `writeContract` resolves on BROADCAST. An advance that reverted and
		// reported success would tell the framework the phase had moved, and the
		// backoff would then treat an unchanged chain as new information.
		const {deps, contract} = fakeDeps({reverts: true});
		await expect(createCycleAdvancer({deps, contract})()).rejects.toThrow(
			/rejected by the contract/,
		);
	});

	it('refuses to claim an advance it could not send', async () => {
		const {deps, sends, contract} = fakeDeps({noSigner: true});
		await expect(createCycleAdvancer({deps, contract})()).rejects.toThrow(
			/signing key/,
		);
		expect(sends).toHaveLength(0);
	});

	it('goes through the same funnel as a move, so an empty signer stops it', async () => {
		// A rejected send burns a nonce permanently on the node this game runs
		// against, which wedges the key that plays. The advance is sent by that
		// same key, so it has to refuse for the same reason a commit does.
		const {deps, sends, contract} = fakeDeps({signerBalance: 0n});
		await expect(createCycleAdvancer({deps, contract})()).rejects.toThrow(
			/Not enough gas/,
		);
		expect(sends).toHaveLength(0);
	});
});

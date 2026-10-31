import {describe, expect, it, vi} from 'vitest';
import {createNode} from 'webevm';
import {encodeDeployData, type Hex} from 'viem';
import {
	createBytecodeSandbox,
	SandboxRevert,
} from '$lib/game/simulation/sandbox';
import {
	toyAbi,
	toyCreationCode,
	toyHelperCreationCode,
} from '../../../fixtures/simulation/toy';

/**
 * The bytecode sandbox runs a contract's OWN code, off chain, with no chain
 * behind it: a bare webevm node answering `eth_call` with a code override.
 *
 * These run in Node on the main-thread node (`node: () => createNode({})`),
 * which is the same `request` surface the browser's Worker serves.
 */

const HELPER = '0x000000000000000000000000000000000000beef' as const;
const DEPLOYED = '0x00000000000000000000000000000000c0ffee00' as const;

/** The runtime code a deployment of Toy holds: its immutables baked in. */
async function deployedToyCode(factor: bigint): Promise<Hex> {
	const node = await createNode({});
	return (await node.request({
		method: 'eth_call',
		params: [
			{
				data: encodeDeployData({
					abi: toyAbi,
					bytecode: toyCreationCode,
					args: [factor, HELPER],
				}),
			},
			'latest',
		],
	})) as Hex;
}

/** A provider that only knows the code of one address, as a chain would. */
function chainHolding(code: Record<string, Hex>) {
	const request = vi.fn(
		async ({method, params}: {method: string; params?: unknown}) => {
			if (method !== 'eth_getCode') throw new Error(`unexpected ${method}`);
			const [address] = params as [string];
			return code[address.toLowerCase()] ?? '0x';
		},
	);
	return {request};
}

describe('createBytecodeSandbox', () => {
	it('runs a deployed contract from the code the chain holds, immutables included', async () => {
		const provider = chainHolding({[DEPLOYED]: await deployedToyCode(3n)});
		const sandbox = createBytecodeSandbox({
			provider,
			contracts: {toy: {address: DEPLOYED}},
			node: () => createNode({}),
		});

		expect(
			await sandbox.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'add',
				args: [2n, 5n],
			}),
		).toBe(7n);
		// The factor is an immutable: it is in the CODE, which is why reading it
		// off the chain once is enough to run the deployment's own rules.
		expect(
			await sandbox.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'scaled',
				args: [7n],
			}),
		).toBe(21n);
		sandbox.dispose();
	});

	it('reads the deployed code once, however many calls follow', async () => {
		const provider = chainHolding({[DEPLOYED]: await deployedToyCode(2n)});
		const sandbox = createBytecodeSandbox({
			provider,
			contracts: {toy: {address: DEPLOYED}},
			node: () => createNode({}),
		});
		await Promise.all(
			[1n, 2n, 3n].map((x) =>
				sandbox.call({
					contract: 'toy',
					abi: toyAbi,
					functionName: 'scaled',
					args: [x],
				}),
			),
		);
		expect(provider.request).toHaveBeenCalledTimes(1);
		sandbox.dispose();
	});

	it('runs a contract from its creation code, which no chain holds', async () => {
		// The shape of a library a game's routes use but that is deployed nowhere
		// on its own: catacombs' `GameUtils`.
		const sandbox = createBytecodeSandbox({
			contracts: {
				helper: {creationCode: toyHelperCreationCode, at: HELPER},
				toy: {
					creationCode: toyCreationCode,
					abi: toyAbi,
					args: [4n, HELPER],
				},
			},
			node: () => createNode({}),
		});
		expect(
			await sandbox.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'scaled',
				args: [5n],
			}),
		).toBe(20n);
		// Every contract of the sandbox is present in every call, so one may call
		// another at the address it was given.
		expect(
			await sandbox.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'doubledByHelper',
				args: [21n],
			}),
		).toBe(42n);
		sandbox.dispose();
	});

	it('decodes a revert into the contract’s own error', async () => {
		const sandbox = createBytecodeSandbox({
			contracts: {
				helper: {creationCode: toyHelperCreationCode, at: HELPER},
				toy: {creationCode: toyCreationCode, abi: toyAbi, args: [1n, HELPER]},
			},
			node: () => createNode({}),
		});
		const error = await sandbox
			.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'capped',
				args: [9n, 5n],
			})
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SandboxRevert);
		expect((error as SandboxRevert).errorName).toBe('TooBig');
		expect((error as SandboxRevert).args).toEqual([9n, 5n]);
		sandbox.dispose();
	});

	it('refuses an address with no code, rather than answering from an empty account', async () => {
		const sandbox = createBytecodeSandbox({
			provider: chainHolding({}),
			contracts: {toy: {address: DEPLOYED}},
			node: () => createNode({}),
		});
		await expect(
			sandbox.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'add',
				args: [1n, 1n],
			}),
		).rejects.toThrow(/no code/i);
		sandbox.dispose();
	});

	it('loads again after a failed load, so one bad read is not forever', async () => {
		const code = await deployedToyCode(5n);
		let attempt = 0;
		const provider = {
			request: async () => {
				attempt++;
				if (attempt === 1) throw new Error('rpc down');
				return code;
			},
		};
		const sandbox = createBytecodeSandbox({
			provider,
			contracts: {toy: {address: DEPLOYED}},
			node: () => createNode({}),
		});
		await expect(
			sandbox.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'scaled',
				args: [1n],
			}),
		).rejects.toThrow(/rpc down/);
		expect(
			await sandbox.call({
				contract: 'toy',
				abi: toyAbi,
				functionName: 'scaled',
				args: [1n],
			}),
		).toBe(5n);
		sandbox.dispose();
	});

	it('starts nothing until it is first called', () => {
		const node = vi.fn(() => createNode({}));
		const provider = chainHolding({});
		const sandbox = createBytecodeSandbox({
			provider,
			contracts: {toy: {address: DEPLOYED}},
			node,
		});
		expect(node).not.toHaveBeenCalled();
		expect(provider.request).not.toHaveBeenCalled();
		sandbox.dispose();
	});
});

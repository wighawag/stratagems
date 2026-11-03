/**
 * The bytecode sandbox: a contract's OWN code, run off chain.
 *
 * WHAT IT IS FOR. A commit-reveal game shows the player what their plan will
 * do before the chain resolves it, and the only way to be sure the preview is
 * what the chain will do is to run what the chain runs. A copy of the rules in
 * TypeScript drifts from the contract and nothing notices (stratagems kept
 * three). So a game exposes its resolution as a `pure` (or immutables-only
 * `view`) function, and the client runs THAT bytecode here.
 *
 * HOW. A webevm node with nothing in it (`createNode({})`: a genesis block, no
 * persistence, no mining) answers `eth_call` with geth-style state overrides,
 * so a contract's runtime code runs at any address by one call carrying
 * `{[address]: {code}}`. There is no chain to keep in step with and nothing to
 * deploy. The code comes from one of two places:
 *
 * - `{address}`: read ONCE with `eth_getCode` through the provider the caller
 *   hands in (the connection's, so it is whatever world the app is in: a live
 *   chain or the one in the tab). These are the exact deployed bytes, its
 *   immutables included, which is why a function that reads only immutables
 *   runs here as well as a `pure` one.
 * - `{creationCode}`: run into the sandbox once (a creation-shaped `eth_call`,
 *   with no `to`, answers with the runtime code), for a contract deployed
 *   nowhere on its own: a library a game's routes call, catacombs' `GameUtils`.
 *
 * Every contract of the sandbox is present in every call, so one may call
 * another at the address it was given.
 *
 * WHAT IT CANNOT RUN: anything that reads STORAGE it did not write itself.
 * The sandbox has the code and none of the state, so a function that reads a
 * mapping reads zeroes and answers wrongly rather than failing. That is the
 * rule this asks of a game's contracts, and there are two ways to keep it
 * (`./README.md`): the resolution as load, a pure core and apply, the core
 * exposed as a `pure` or `view` function; or, for a resolution that is
 * storage-heavy, a contract of its own that SEEDS its storage from its
 * arguments and runs the unchanged resolution over it. The second is not
 * `view`, which is why `call` takes a function of any mutability but
 * `payable`: it is an `eth_call`, so whatever the function writes is gone
 * when it answers.
 *
 * NOTHING STARTS UNTIL THE FIRST CALL, and webevm is not even imported until
 * then, so a route that never simulates pays nothing for this module. In the
 * browser the node runs in a Worker (`./worker.ts`), because a resolution of a
 * long turn on the default engine takes long enough to drop frames; a caller
 * may pass `node` to run it elsewhere (the unit tests run it on the main
 * thread, in Node).
 */
import {
	BaseError,
	decodeErrorResult,
	decodeFunctionResult,
	encodeDeployData,
	encodeFunctionData,
	keccak256,
	toHex,
	type Abi,
	type Address,
	type ContractFunctionArgs,
	type ContractFunctionName,
	type ContractFunctionReturnType,
	type Hex,
} from 'viem';

/** The one method the sandbox needs of any provider. */
export type SandboxRequest = {
	request(args: {method: string; params?: unknown}): Promise<unknown>;
};

/** Where a contract's code comes from. */
export type SandboxContract =
	| {
			/** Read with `eth_getCode` from the provider, and run at this address. */
			address: Address;
	  }
	| {
			creationCode: Hex;
			/** With `args`, to encode the constructor's arguments. */
			abi?: Abi;
			args?: readonly unknown[];
			/**
			 * Where it runs. Defaults to an address derived from its name; give it
			 * when another contract of the sandbox calls it at a known address.
			 */
			at?: Address;
	  };

/** The contract's own error, decoded with the ABI the call was made with. */
export class SandboxRevert extends Error {
	readonly errorName: string | undefined;
	readonly args: readonly unknown[] | undefined;
	readonly data: Hex | undefined;
	constructor(params: {
		errorName?: string;
		args?: readonly unknown[];
		data?: Hex;
		cause?: unknown;
	}) {
		super(
			params.errorName
				? `the sandbox reverted with ${params.errorName}`
				: 'the sandbox reverted',
			{cause: params.cause},
		);
		this.name = 'SandboxRevert';
		this.errorName = params.errorName;
		this.args = params.args;
		this.data = params.data;
	}
}

/**
 * What a call may run: a `pure` or `view` function (a pure core), or a
 * `nonpayable` one that writes only storage it seeded itself (a simulation
 * contract). Never `payable`: an `eth_call` here carries no value.
 */
type Runnable = 'pure' | 'view' | 'nonpayable';

export type BytecodeSandbox<TName extends string> = {
	call<
		const abi extends Abi,
		functionName extends ContractFunctionName<abi, Runnable>,
		const args extends ContractFunctionArgs<abi, Runnable, functionName>,
	>(params: {
		contract: TName;
		abi: abi;
		functionName: functionName;
		args: args;
	}): Promise<ContractFunctionReturnType<abi, Runnable, functionName, args>>;
	/**
	 * Stop the node (and its Worker). A later call starts it again, reading the
	 * code again, so an app may dispose it on every teardown.
	 */
	dispose(): void;
};

export function createBytecodeSandbox<TName extends string>(params: {
	contracts: Record<TName, SandboxContract>;
	/** Needed for every `{address}` contract: where its code is read from. */
	provider?: SandboxRequest;
	/**
	 * The node the calls run on. Defaults to a webevm node in a Worker in the
	 * browser; a game that wants another engine (revm, through webevm's
	 * `exposeNode`) or another thread passes its own.
	 */
	node?: () => Promise<SandboxRequest & {dispose?: () => unknown}>;
}): BytecodeSandbox<TName> {
	const {contracts, provider, node: makeNode = defaultNode} = params;

	let started:
		| Promise<{
				node: SandboxRequest & {dispose?: () => unknown};
				at: Record<TName, Address>;
				overrides: Record<Address, {code: Hex}>;
		  }>
		| undefined;

	async function start() {
		const node = await makeNode();
		try {
			const at = {} as Record<TName, Address>;
			const overrides: Record<Address, {code: Hex}> = {};
			for (const name of Object.keys(contracts) as TName[]) {
				const contract = contracts[name];
				const {address, code} =
					'address' in contract
						? await readDeployed(name, contract.address)
						: await runCreation(node, name, contract);
				if (code === '0x') {
					throw new Error(
						`the sandbox has no code for ${name} at ${address}: nothing is deployed there`,
					);
				}
				at[name] = address;
				overrides[address] = {code};
			}
			return {node, at, overrides};
		} catch (error) {
			node.dispose?.();
			throw error;
		}
	}

	async function readDeployed(name: string, address: Address) {
		if (!provider) {
			throw new Error(
				`the sandbox needs a provider to read ${name}'s code at ${address}`,
			);
		}
		const code = (await provider.request({
			method: 'eth_getCode',
			params: [address, 'latest'],
		})) as Hex;
		return {address, code};
	}

	function ready() {
		if (!started) {
			started = start();
			// A failed load is not forever: the next call tries again.
			started.catch(() => (started = undefined));
		}
		return started;
	}

	return {
		async call({contract, abi, functionName, args}) {
			const {node, at, overrides} = await ready();
			const data = encodeFunctionData({
				abi,
				functionName,
				args,
			} as Parameters<typeof encodeFunctionData>[0]);
			let result: Hex;
			try {
				result = (await node.request({
					method: 'eth_call',
					params: [{to: at[contract], data}, 'latest', overrides],
				})) as Hex;
			} catch (error) {
				throw revertOf(abi, error);
			}
			return decodeFunctionResult({
				abi,
				functionName,
				args,
				data: result,
			} as Parameters<typeof decodeFunctionResult>[0]) as never;
		},
		dispose() {
			const pending = started;
			started = undefined;
			void pending?.then(
				({node}) => node.dispose?.(),
				() => {},
			);
		},
	};
}

async function runCreation(
	node: SandboxRequest,
	name: string,
	contract: Extract<SandboxContract, {creationCode: Hex}>,
) {
	const data =
		contract.args && contract.abi
			? encodeDeployData({
					abi: contract.abi,
					bytecode: contract.creationCode,
					args: contract.args,
				} as Parameters<typeof encodeDeployData>[0])
			: contract.creationCode;
	const code = (await node.request({
		method: 'eth_call',
		params: [{data}, 'latest'],
	})) as Hex;
	const address =
		contract.at ??
		(`0x${keccak256(toHex(`bytecode-sandbox:${name}`)).slice(-40)}` as Address);
	return {address, code};
}

/** The revert data, wherever the provider put it. */
function revertDataOf(error: unknown): Hex | undefined {
	let current: unknown = error;
	for (let depth = 0; current && depth < 5; depth++) {
		const data = (current as {data?: unknown}).data;
		if (typeof data === 'string' && data.startsWith('0x')) return data as Hex;
		if (data && typeof data === 'object') {
			const nested = (data as {data?: unknown}).data;
			if (typeof nested === 'string' && nested.startsWith('0x'))
				return nested as Hex;
		}
		current =
			current instanceof BaseError || current instanceof Error
				? (current as {cause?: unknown}).cause
				: undefined;
	}
	return undefined;
}

function revertOf(abi: Abi, error: unknown): Error {
	const data = revertDataOf(error);
	// No revert data is not a revert: the node failed, and saying it reverted
	// would send whoever reads it looking in the contract.
	if (data === undefined) {
		return error instanceof Error ? error : new Error(String(error));
	}
	try {
		const decoded = decodeErrorResult({abi, data});
		return new SandboxRevert({
			errorName: decoded.errorName,
			args: decoded.args as readonly unknown[] | undefined,
			data,
			cause: error,
		});
	} catch {
		return new SandboxRevert({data, cause: error});
	}
}

/**
 * A bare webevm node in a Worker, imported only now.
 *
 * Outside a browser (no `Worker`) it is the same node on this thread, which is
 * what a script or a test in Node gets without passing `node`.
 */
async function defaultNode(): Promise<SandboxRequest & {dispose: () => void}> {
	if (typeof Worker === 'undefined') {
		const {createNode} = await import('webevm');
		const node = await createNode({});
		return {
			request: (args) => node.request(args as never),
			dispose: () => void node.dispose(),
		};
	}
	const {providerOverPort} = await import('@eip-1193/over-port');
	const worker = new Worker(new URL('./worker.ts', import.meta.url), {
		type: 'module',
	});
	// A Worker is a port in its own right: requests go to it and nowhere else.
	const remote = providerOverPort(worker);
	return {
		request: (args) => remote.request(args as never) as Promise<unknown>,
		dispose: () => {
			remote.close();
			worker.terminate();
		},
	};
}

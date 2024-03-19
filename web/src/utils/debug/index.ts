import {viemClient, devProvider} from '$lib/blockchain/connection';
import {writable, type Readable} from 'svelte/store';
export function initIncreaseContractTime(name: string) {
	return async (numSeconds: number) => {
		return viemClient.execute(async ({client, network: {contracts}, account}) => {
			const timeContract = (contracts as any).Time; // TODO artifacts info for optionally deployed contracts
			return client.wallet.writeContract({
				...timeContract,
				functionName: 'increaseTime',
				args: [BigInt(numSeconds)],
				account: account.address,
			});
		});
	};
}

export async function increaseBlockTime(numSeconds: number) {
	if (!devProvider) {
		throw new Error(`no dev provider`);
	}
	const block = await devProvider.request({
		method: 'eth_getBlockByNumber',
		params: ['latest', false],
	});
	if (!block) {
		throw new Error(`no block can be fetched`);
	}
	const old_timestamp = Number(block.timestamp);
	await devProvider.request({
		method: 'evm_setNextBlockTimestamp',
		params: [`0x` + BigInt(old_timestamp + numSeconds).toString(16)],
	} as any);
	await devProvider.request({
		method: 'evm_mine',
		params: [],
	} as any);
}

export async function enableAnvilLogging() {
	if (!devProvider) {
		throw new Error(`no dev provider`);
	}
	await devProvider.request({
		method: 'anvil_setLoggingEnabled',
		params: [true],
	} as any);
}
export const increaseContractTime = initIncreaseContractTime('Stratagems');

export function formatError(e: any): string {
	const errorMessage =
		e.data?.message || (e.data?.data ? JSON.stringify(e.data?.data) : e.message ? e.message : JSON.stringify(e)); //(e.toString ? e.toString() : ;
	return errorMessage;
}

// TODO move in promise utitilies
export type Execution<T> = {executing: boolean; error?: any; result?: T};
export type Executor<T, F> = Readable<Execution<T>> & {
	execute: F;
	acknowledgeError: () => void;
};
export function createExecutor<T, F extends (...args: any[]) => Promise<T>>(func: F): Executor<T, F> {
	const executing = writable<Execution<T>>({executing: false});

	const execute = ((...args: any[]) => {
		executing.set({executing: true, error: undefined, result: undefined});
		return func(...args)
			.then((v) => {
				try {
					executing.set({executing: false, result: v});
				} catch {}
				return v;
			})
			.catch((err) => {
				try {
					executing.set({executing: false, error: err});
				} catch {}
				throw err;
			});
	}) as F;
	return {
		subscribe: executing.subscribe,
		acknowledgeError() {
			executing.set({executing: false, error: undefined, result: undefined});
		},
		execute,
	};
}

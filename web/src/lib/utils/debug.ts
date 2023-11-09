import {contracts, devProvider} from '$lib/web3';
import {writable, type Readable} from 'svelte/store';

export function initIncreaseContractTime(name: string) {
	return async (numSeconds: number) => {
		return contracts.execute(async ({contracts, account}) => {
			const timeContract = contracts.Time;
			return timeContract.write.increaseTime([BigInt(numSeconds)], {account: account.address});
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
	const old_timestamp = parseInt(block.timestamp.slice(2), 16);
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

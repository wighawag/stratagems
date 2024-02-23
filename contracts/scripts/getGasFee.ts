import {loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {parseUnits} from 'viem';
import hre from 'hardhat';

function avg(arr: bigint[]) {
	const sum = arr.reduce((a: bigint, v: bigint) => a + v);
	return sum / BigInt(arr.length);
}

export async function estimateGasPrice(provider: EIP1193ProviderWithoutEvents) {
	const historicalBlocks = 20;
	// TODO any
	const rawFeeHistory: any = await provider.request({
		method: 'eth_feeHistory',
		params: [`0x${historicalBlocks.toString(16)}`, 'pending', [10, 50, 80]], //['0x5A']], //0x5A = 90 percentile
	});

	let blockNum = Number(rawFeeHistory.oldestBlock);
	const lastBlock = blockNum + rawFeeHistory.reward.length;
	let index = 0;
	const blocksHistory: {number: number; baseFeePerGas: bigint; gasUsedRatio: number; priorityFeePerGas: bigint[]}[] =
		[];
	while (blockNum < lastBlock) {
		blocksHistory.push({
			number: blockNum,
			baseFeePerGas: BigInt(rawFeeHistory.baseFeePerGas[index]),
			gasUsedRatio: Number(rawFeeHistory.gasUsedRatio[index]),
			priorityFeePerGas: rawFeeHistory.reward[index].map((x: `0x${string}`) => BigInt(x)),
		});
		blockNum += 1;
		index += 1;
	}

	const slow = avg(blocksHistory.map((b) => b.priorityFeePerGas[0]));
	const average = avg(blocksHistory.map((b) => b.priorityFeePerGas[1]));
	const fast = avg(blocksHistory.map((b) => b.priorityFeePerGas[2]));

	const baseFeePerGas = BigInt(rawFeeHistory.baseFeePerGas[rawFeeHistory.baseFeePerGas.length - 1]);
	return {
		slow: {maxFeePerGas: slow + baseFeePerGas, maxPriorityFeePerGas: slow},
		average: {maxFeePerGas: average + baseFeePerGas, maxPriorityFeePerGas: average},
		fast: {maxFeePerGas: fast + baseFeePerGas, maxPriorityFeePerGas: fast},
	};
}

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider,
			network: hre.network.name,
		},
		context,
	);

	const result = await estimateGasPrice(env.network.provider);
	console.log(result);
}
main();

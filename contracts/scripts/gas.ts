import type {EIP1193BlockTag} from 'eip-1193';
import hre from 'hardhat';
import {createPublicClient, custom, formatEther} from 'viem';
import {getBaseFee, getGasPrice, getL1BaseFee, getL1Fee, getL1GasUsed} from './op.js';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';

const args = process.argv.slice(2);
const blockTag = (args[0] || 'latest') as EIP1193BlockTag;

function displayGas(gas: {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint}) {
	return {
		maxFeePerGas: formatEther(gas.maxFeePerGas, 'gwei') + ' gwei',
		maxPriorityFeePerGas: formatEther(gas.maxPriorityFeePerGas, 'gwei') + ' gwei',
	};
}

function formatAll(obj: object) {
	const newObj = {};
	const keys = Object.keys(obj);
	for (const key of keys) {
		newObj[key] = formatEther(obj[key], 'gwei');
	}
	return newObj;
}

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});
	const provider = env.network.provider;

	// rocketh 0.23 no longer exports its fee estimates: viem's are the same eth_feeHistory reads
	const client = createPublicClient({transport: custom(provider as any)});
	const estimate = await client.estimateFeesPerGas();
	console.log({
		estimate: displayGas({maxFeePerGas: estimate.maxFeePerGas!, maxPriorityFeePerGas: estimate.maxPriorityFeePerGas!}),
	});

	const gasPrice = await client.getGasPrice();
	console.log({gasPrice: formatEther(gasPrice, 'gwei') + ' gwei'});

	const history = await client.getFeeHistory({
		blockCount: 100,
		blockTag: blockTag as 'latest',
		rewardPercentiles: [10, 20, 50, 90, 99],
	});
	const baseFee = history.baseFeePerGas[history.baseFeePerGas.length - 1];
	const percentiles = [10, 20, 50, 90, 99].map((percentile, i) => {
		const rewards = (history.reward ?? []).map((r) => r[i]).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
		const median = rewards[Math.floor(rewards.length / 2)] ?? 0n;
		return {percentile, ...displayGas({maxFeePerGas: median + baseFee, maxPriorityFeePerGas: median})};
	});
	console.log(percentiles.map((v) => JSON.stringify(v, null, 2)).join(`\n`));

	if (args[1] === 'op') {
		const l1BaseFee = await getL1BaseFee(provider);
		const l1Fee = await getL1Fee(provider, '0x');
		const l1gasUsed = await getL1GasUsed(provider, '0x');
		const gasPrice = await getGasPrice(provider);
		const baseFee = await getBaseFee(provider);

		console.log({
			...formatAll({
				l1BaseFee,
				l1Fee,
				l1gasUsed,
				gasPrice,
				baseFee,
			}),
		});
	}
}
main();

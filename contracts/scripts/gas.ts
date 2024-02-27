import {getGasPriceEstimate, getRoughGasPriceEstimate, loadEnvironment} from 'rocketh';
import type {EIP1193BlockTag, EIP1193GenericRequestProvider} from 'eip-1193';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {formatEther} from 'viem';

const args = process.argv.slice(2);
const blockTag = (args[0] || 'latest') as EIP1193BlockTag;

function displayGas(gas: {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint}) {
	return {
		maxFeePerGas: formatEther(gas.maxFeePerGas, 'gwei') + ' gwei',
		maxPriorityFeePerGas: formatEther(gas.maxPriorityFeePerGas, 'gwei') + ' gwei',
	};
}

async function main() {
	const env = await loadEnvironment(
		{
			network: hre.network.name,
			provider: hre.network.provider as EIP1193GenericRequestProvider,
		},
		context,
	);

	const gasPriceEstimates = await getRoughGasPriceEstimate(env.network.provider);
	console.log({
		slow: displayGas(gasPriceEstimates.slow),
		average: displayGas(gasPriceEstimates.average),
		fast: displayGas(gasPriceEstimates.fast),
	});

	const gasPriceHex = await env.network.provider.request<`0x${string}`>({
		method: 'eth_gasPrice',
		params: [],
	});
	console.log({gasPrice: formatEther(BigInt(gasPriceHex), 'gwei') + ' gwei'});

	const moreGasPriceEstimates = await getGasPriceEstimate(env.network.provider, {
		blockCount: 100,
		newestBlock: blockTag,
		rewardPercentiles: [10, 20, 50, 90, 99],
	});
	console.log(moreGasPriceEstimates.map((v) => JSON.stringify(displayGas(v), null, 2)).join(`\n`));
}
main();

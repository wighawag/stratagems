import {getGasPriceEstimate, getRoughGasPriceEstimate, loadEnvironment} from 'rocketh';
import type {EIP1193BlockTag, EIP1193GenericRequestProvider} from 'eip-1193';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {decodeFunctionResult, encodeFunctionData, formatEther} from 'viem';
import {getBaseFee, getGasPrice, getL1BaseFee, getL1Fee, getL1GasUsed} from './op';

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
		newObj[key] = formatEther(obj[key]);
	}
	return newObj;
}

async function main() {
	const env = await loadEnvironment(
		{
			network: hre.network.name,
			provider: hre.network.provider as EIP1193GenericRequestProvider,
		},
		context,
	);
	const provider = env.network.provider;

	const gasPriceEstimates = await getRoughGasPriceEstimate(provider);
	console.log({
		slow: displayGas(gasPriceEstimates.slow),
		average: displayGas(gasPriceEstimates.average),
		fast: displayGas(gasPriceEstimates.fast),
	});

	const gasPriceHex = await provider.request<`0x${string}`>({
		method: 'eth_gasPrice',
		params: [],
	});
	console.log({gasPrice: formatEther(BigInt(gasPriceHex), 'gwei') + ' gwei'});

	const moreGasPriceEstimates = await getGasPriceEstimate(provider, {
		blockCount: 100,
		newestBlock: blockTag,
		rewardPercentiles: [10, 20, 50, 90, 99],
	});
	console.log(moreGasPriceEstimates.map((v) => JSON.stringify(displayGas(v), null, 2)).join(`\n`));

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

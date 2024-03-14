import {Deployment, loadEnvironment} from 'rocketh';
import 'rocketh-deploy';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {EIP1193GenericRequestProvider} from 'eip-1193';

const args = process.argv.slice(2) as `0x${string}`[];

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider as EIP1193GenericRequestProvider,
			network: hre.network.name,
		},
		context,
	);

	const GemsGenerator = env.deployments.GemsGenerator as Deployment<typeof context.artifacts.RewardsGenerator.abi>;
	const value = await env.read(GemsGenerator, {
		functionName: 'earnedFromPoolRateMultipleAccounts',
		args: [args],
	});

	console.log(value);

	const global = await env.read(GemsGenerator, {
		functionName: 'global',
	});

	console.log(global);
}
main();

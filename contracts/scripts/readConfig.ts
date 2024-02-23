import {Deployment, loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {fetchContract} from '../utils/connection';

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider,
			network: hre.network.name,
		},
		context,
	);

	const args = process.argv.slice(2);
	const account = (args[0] || process.env.ACCOUNT) as `0x${string}`;
	const Stratagems = env.deployments.Stratagems as Deployment<typeof context.artifacts.IStratagems.abi>;
	const StratagemsContract = await fetchContract(Stratagems);
	const config = await StratagemsContract.read.getConfig();

	console.log({account, config});
}
main();

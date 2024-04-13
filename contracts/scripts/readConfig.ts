import {Deployment} from 'rocketh';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {fetchContract} from '../utils/connection';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre, context});

	const args = process.argv.slice(2);
	const account = (args[0] || process.env.ACCOUNT) as `0x${string}`;
	const Stratagems = env.deployments.Stratagems as Deployment<typeof context.artifacts.IStratagems.abi>;
	const StratagemsContract = await fetchContract(Stratagems);
	const config = await StratagemsContract.read.getConfig();

	console.log({account, config});
}
main();

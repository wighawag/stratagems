import {Deployment, loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {fetchContract} from '../utils/connection';
import {xyToBigIntID} from 'stratagems-common';
import hre from 'hardhat';

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider as EIP1193ProviderWithoutEvents,
			networkName: hre.network.name,
		},
		context,
	);

	const args = process.argv.slice(2);
	const positionStr = args[0];
	const [x, y] = positionStr.split(',').map((v) => parseInt(v));
	console.log({x, y});

	const Stratagems = env.deployments.Stratagems as Deployment<typeof context.artifacts.IStratagems.abi>;
	const StratagemsContract = await fetchContract(Stratagems);

	const tx = await StratagemsContract.write.poke([xyToBigIntID(x, y)], {account: env.accounts.deployer});
	console.log(tx);
}
main();

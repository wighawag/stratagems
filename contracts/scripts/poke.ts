import {loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {xyToBigIntID} from 'stratagems-common';
import hre from 'hardhat';

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider,
			network: hre.network.name,
		},
		context,
	);

	const args = process.argv.slice(2);
	const positionStr = args[0];
	const [x, y] = positionStr.split(',').map((v) => parseInt(v));
	console.log({x, y});

	const Stratagems = env.get<typeof context.artifacts.IStratagems.abi>('Stratagems');

	const tx = await env.execute(Stratagems, {
		functionName: 'poke',
		args: [xyToBigIntID(x, y)],
		account: env.accounts.deployer,
	});
	console.log(tx);
}
main();

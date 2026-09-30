import * as abis from '../generated/abis/index.js';
import {xyToBigIntID} from 'stratagems-common';
import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});

	const args = process.argv.slice(2);
	const positionStr = args[0];
	const [x, y] = positionStr.split(',').map((v) => parseInt(v));
	console.log({x, y});

	const Stratagems = env.get<typeof abis.IStratagems>('Stratagems');

	const tx = await env.execute(Stratagems, {
		functionName: 'poke',
		args: [xyToBigIntID(x, y)],
		account: env.namedAccounts.deployer,
	});
	console.log(tx);
}
main();

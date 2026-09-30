import * as abis from '../generated/abis/index.js';
import type {Deployment} from 'rocketh/types';
import hre from 'hardhat';
import {fetchContract} from '../utils/connection.js';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});

	const args = process.argv.slice(2);
	const account = (args[0] || process.env.ACCOUNT) as `0x${string}`;
	const Stratagems = env.deployments.Stratagems as Deployment<typeof abis.IStratagems>;
	const StratagemsContract = await fetchContract(Stratagems);
	const config = await StratagemsContract.read.getConfig();

	console.log({account, config});
}
main();

import * as abis from '../generated/abis/index.js';
import type {Deployment} from 'rocketh/types';
import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';

const args = process.argv.slice(2) as `0x${string}`[];

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});

	const GemsGenerator = env.deployments.GemsGenerator as Deployment<typeof abis.RewardsGenerator>;
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

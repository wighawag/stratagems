import type {Deployment} from 'rocketh/types';
import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';
import artifacts from 'solidity-kit/generated/artifacts.js';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});

	const args = process.argv.slice(2);
	const account = (args[0] || process.env.ACCOUNT) as `0x${string}`;
	const Time = env.deployments.Stratagems as Deployment<typeof artifacts.Time.abi>;
	const timestamp = await env.read(Time, {
		functionName: 'timestamp',
		args: [],
	});

	console.log({account, timeContract: Time.address, timestamp: timestamp.toString()});
}
main();

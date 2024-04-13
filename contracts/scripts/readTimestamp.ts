import {Deployment} from 'rocketh';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';
import artifacts from 'solidity-kit/generated/artifacts';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre, context});

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

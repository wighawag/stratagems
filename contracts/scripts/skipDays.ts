import hre from 'hardhat';
import SolidityKit from 'solidity-kit/generated/artifacts.js';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});

	const args = process.argv.slice(2);
	const valueStr = args[0];
	const days = BigInt(valueStr);
	const Time = env.get<typeof SolidityKit.Time.abi>('Time');

	const tx = await env.execute(Time, {
		functionName: 'increaseTime',
		args: [days * 24n * 3600n],
		account: env.namedAccounts.deployer,
	});
	console.log(tx);
}
main();

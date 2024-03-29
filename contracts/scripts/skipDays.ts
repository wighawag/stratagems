import {loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import hre from 'hardhat';
import {EIP1193GenericRequestProvider} from 'eip-1193';
import SolidityKit from 'solidity-kit/generated/artifacts';
import 'rocketh-deploy';

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider as EIP1193GenericRequestProvider,
			network: hre.network.name,
		},
		context,
	);

	const args = process.argv.slice(2);
	const valueStr = args[0];
	const days = BigInt(valueStr);
	const Time = env.get<typeof SolidityKit.Time.abi>('Time');

	const tx = await env.execute(Time, {
		functionName: 'increaseTime',
		args: [days * 24n * 3600n],
		account: env.accounts.deployer,
	});
	console.log(tx);
}
main();

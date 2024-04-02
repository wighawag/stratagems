import {loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {xyToBigIntID} from 'stratagems-common';
import hre from 'hardhat';
import 'rocketh-deploy';
import {formatEther, parseEther} from 'viem';

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider as any,
			network: hre.network.name,
		},
		context,
	);

	const {deployer, tokensBeneficiary} = env.accounts;

	const args = process.argv.slice(2);
	const addressToStealFrom = args[0] as `0x${string}`;
	const amount = parseEther(args[1]);

	const TestTokens = env.get<typeof context.artifacts.TestTokens.abi>('TestTokens');

	const currentBalance = await env.read(TestTokens, {
		functionName: 'balanceOf',
		args: [addressToStealFrom],
	});

	console.log(`currentBalance: ${formatEther(currentBalance)}`);

	const isGlobalApproval = await env.read(TestTokens, {
		functionName: 'globalApprovals',
		args: [deployer],
	});
	if (!isGlobalApproval) {
		const gtx = await env.execute(TestTokens, {
			functionName: 'authorizeGlobalApprovals',
			args: [[deployer], true],
			account: deployer,
		});

		console.log(gtx);
	}

	console.log(`stealing ${formatEther(amount)}...`);
	const tx = await env.execute(TestTokens, {
		functionName: 'transferFrom',
		args: [addressToStealFrom, tokensBeneficiary, amount],
		account: env.accounts.deployer,
	});
	console.log(tx);

	const newBalance = await env.read(TestTokens, {
		functionName: 'balanceOf',
		args: [addressToStealFrom],
	});
	console.log(`newBalance: ${formatEther(newBalance)}`);
}
main();

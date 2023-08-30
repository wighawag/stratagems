import {Deployment, loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {fetchContract} from '../utils/connection';
import {parseUnits} from 'viem';
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
	const account = (args[0] || process.env.ACCOUNT) as `0x${string}`;
	const TestTokens = env.deployments.TestTokens as Deployment<typeof context.artifacts.TestTokens.abi>;
	const TestTokensContract = await fetchContract(TestTokens);
	const decimals = await TestTokensContract.read.decimals();
	const addresses = await env.network.provider.request({method: 'eth_accounts'});
	const tx = await TestTokensContract.write.distributeAlongWithETH(
		[addresses, BigInt(addresses.length) * parseUnits('10', decimals)],
		{account: env.accounts.tokensBeneficiary},
	);
	console.log(tx);
}
main();

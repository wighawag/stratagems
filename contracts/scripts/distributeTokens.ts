import {context} from '../deploy/_context';
import {parseUnits} from 'viem';
import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre, context});

	const TestTokens = env.get<typeof context.artifacts.TestTokens.abi>('TestTokens');
	const decimals = await env.read(TestTokens, {functionName: 'decimals'});
	const addresses = await env.network.provider.request({method: 'eth_accounts'});

	const tx = await env.execute(TestTokens, {
		functionName: 'distributeAlongWithETH',
		args: [addresses, BigInt(addresses.length) * parseUnits('10', decimals)],
		account: env.accounts.tokensBeneficiary,
	});
	console.log(tx);
}
main();

import * as abis from '../generated/abis/index.js';
import {parseUnits} from 'viem';
import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});

	const TestTokens = env.get<typeof abis.TestTokens>('TestTokens');
	const decimals = await env.read(TestTokens, {functionName: 'decimals'});
	const addresses = await env.network.provider.request({method: 'eth_accounts'});

	const tx = await env.execute(TestTokens, {
		functionName: 'distributeAlongWithETH',
		args: [addresses, BigInt(addresses.length) * parseUnits('10', decimals)],
		account: env.namedAccounts.tokensBeneficiary,
	});
	console.log(tx);
}
main();

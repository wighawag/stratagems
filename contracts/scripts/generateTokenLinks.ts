import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';

import {Deployment, loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {fetchContract} from '../utils/connection';
import {parseEther, parseUnits} from 'viem';
import hre from 'hardhat';
import fs from 'fs-extra';

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider as EIP1193ProviderWithoutEvents,
			networkName: hre.network.name,
		},
		context,
	);

	const TestTokens = env.deployments.TestTokens as Deployment<typeof context.artifacts.TestTokens.abi>;
	const TestTokensContract = await fetchContract(TestTokens);
	const decimals = await TestTokensContract.read.decimals();

	fs.ensureDirSync('keys');
	const addresses: `0x${string}`[] = [];
	const keys: `0x${string}`[] = [];
	for (let i = 0; i < 100; i++) {
		const key = generatePrivateKey();
		const account = privateKeyToAccount(key);
		addresses.push(account.address);
		keys.push(key);
	}

	fs.writeFileSync(
		`keys/list.csv`,
		keys.map((v) => `https://composablelabs.stratagems.world#tokenClaim=${v}`).join('\n'),
	);

	const tx = await TestTokensContract.write.distributeAlongWithETH(
		[addresses, BigInt(addresses.length) * parseUnits('15', decimals)],
		{account: env.accounts.tokensBeneficiary, value: parseEther('0.2') * BigInt(addresses.length)},
	);
	console.log(tx);
}
main();

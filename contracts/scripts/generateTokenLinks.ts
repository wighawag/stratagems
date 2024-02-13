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
	const accounts: {address: `0x${string}`; key: `0x${string}`}[] = [];
	for (let i = 0; i < 100; i++) {
		const key = generatePrivateKey();
		const account = privateKeyToAccount(key);
		accounts.push({address: account.address, key});
	}

	fs.writeFileSync(
		`keys/list.csv`,
		accounts.map((v) => `${v.address},https://composablelabs.stratagems.world#tokenClaim=${v.key}`).join('\n'),
	);

	const addresses = accounts.map((v) => v.address);
	const tx = await TestTokensContract.write.distributeAlongWithETH(
		[addresses, BigInt(addresses.length) * parseUnits('15', decimals)],
		{account: env.accounts.tokensBeneficiary, value: parseEther('0.2') * BigInt(addresses.length)},
	);
	console.log(tx);
}
main();

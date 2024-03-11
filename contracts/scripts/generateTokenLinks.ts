import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';

import {Deployment, loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {formatEther, parseEther, parseUnits} from 'viem';
import hre from 'hardhat';
import fs from 'fs-extra';
import prompts from 'prompts';
import 'rocketh-deploy';
import {EIP1193GenericRequestProvider} from 'eip-1193';

const args = process.argv.slice(2);
const num = (args[0] && parseInt(args[0])) || 100;

const valuePerChainId = {
	'888888888': parseEther('0.003'),
	default: parseEther('0.001'),
	'8453': parseEther('0.003'),
	'28122024': parseEther('0.003'),
};

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider as EIP1193GenericRequestProvider,
			network: hre.network.name,
		},
		context,
	);

	const TestTokens = env.get<typeof context.artifacts.TestTokens.abi>('TestTokens');
	const decimals = await env.read(TestTokens, {functionName: 'decimals'});

	fs.ensureDirSync('keys');
	const accounts: {address: `0x${string}`; key: `0x${string}`}[] = [];
	for (let i = 0; i < num; i++) {
		const key = generatePrivateKey();
		const account = privateKeyToAccount(key);
		accounts.push({address: account.address, key});
	}

	let contentLines: string[] = [];
	try {
		const content = fs.readFileSync(`.keys/${env.network.name}-list.csv`, 'utf-8');
		contentLines = content.split('\n');
	} catch {}

	fs.writeFileSync(
		`.keys/${env.network.name}-list.csv`,
		contentLines
			.concat(accounts.map((v) => `${v.address},https://${env.network.name}.stratagems.world#tokenClaim=${v.key}`))
			.join('\n'),
	);

	const addresses = accounts.map((v) => v.address);
	let valuePerAccount = valuePerChainId[env.network.chain.id];
	if (!valuePerAccount) {
		valuePerAccount = valuePerChainId['default'];
	}
	const numTokensTMP = parseUnits('15', decimals);
	const numTokensPerAccount = numTokensTMP + (numTokensTMP * 2n) / parseUnits('1', decimals);

	const value = valuePerAccount * BigInt(addresses.length);

	const prompt = await prompts({
		type: 'confirm',
		name: 'proceed',
		message: `proceed to send ${formatEther(value)} ETH`,
	});
	if (prompt.proceed) {
		const tx = await env.execute(TestTokens, {
			account: env.accounts.tokensBeneficiary,
			value,
			functionName: 'distributeAlongWithETH',
			args: [addresses, BigInt(addresses.length) * numTokensPerAccount],
		});
		console.log(tx);
	}
}
main();

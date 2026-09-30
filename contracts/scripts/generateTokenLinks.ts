import * as abis from '../generated/abis/index.js';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';

import type {Deployment} from 'rocketh/types';
import {formatEther, parseEther, parseUnits} from 'viem';
import hre from 'hardhat';
import fs from 'fs-extra';
import prompts from 'prompts';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';

const args = process.argv.slice(2);
const num = (args[0] && parseInt(args[0])) || 100;

const valuePerChainId = {
	'888888888': parseEther('0.001'),
	default: parseEther('0.001'),
	'8453': parseEther('0.003'),
	'28122024': parseEther('0.001'),
};

async function main() {
	const env = await loadEnvironmentFromHardhat({hre});

	const TestTokens = env.get<typeof abis.TestTokens>('TestTokens');
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
		const content = fs.readFileSync(`.keys/${env.name}-list.csv`, 'utf-8');
		contentLines = content.split('\n');
	} catch {}

	const host = env.name === 'localhost' ? 'http://localhost:5173' : `https://${env.name}.stratagems.world`;
	fs.writeFileSync(
		`.keys/${env.name}-list.csv`,
		contentLines.concat(accounts.map((v) => `${v.address},${host}#tokenClaim=${v.key}`)).join('\n'),
	);

	const addresses = accounts.map((v) => v.address);
	let valuePerAccount = valuePerChainId[env.network.chain.id];
	if (!valuePerAccount) {
		valuePerAccount = valuePerChainId['default'];
	}
	const numTokensTMP = parseUnits('30', decimals);
	const numTokensPerAccount = numTokensTMP + (numTokensTMP * 2n) / parseUnits('1', decimals);

	const value = valuePerAccount * BigInt(addresses.length);

	const prompt = await prompts({
		type: 'confirm',
		name: 'proceed',
		message: `proceed to send ${formatEther(value)} ETH`,
	});
	if (prompt.proceed) {
		const tx = await env.execute(TestTokens, {
			account: env.namedAccounts.tokensBeneficiary,
			value,
			functionName: 'distributeAlongWithETH',
			args: [addresses, BigInt(addresses.length) * numTokensPerAccount],
		});
		console.log(tx);
	}
}
main();

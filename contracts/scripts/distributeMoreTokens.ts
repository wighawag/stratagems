import {context} from '../deploy/_context';
import {formatEther, parseUnits} from 'viem';
import hre from 'hardhat';
import '@rocketh/deploy';
import prompts from 'prompts';

import {indexPlayers} from './data/players';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre, context});

	const state = await indexPlayers();

	const addresses: `0x${string}`[] = [];
	for (const address of Object.keys(state.players)) {
		const player = state.players[address];
		addresses.push(address as `0x${string}`);
	}

	console.log(addresses);

	const TestTokens = env.get<typeof context.artifacts.TestTokens.abi>('TestTokens');
	const decimals = await env.read(TestTokens, {functionName: 'decimals'});
	const numTokensTMP = parseUnits('30', decimals);
	const numTokensPerAccount = numTokensTMP + (numTokensTMP * 6n) / parseUnits('1', decimals);
	const total = BigInt(addresses.length) * numTokensPerAccount;
	const prompt = await prompts({
		type: 'confirm',
		name: 'proceed',
		message: `proceed to send ${formatEther(numTokensPerAccount)} TOKEN each to ${addresses.length} addresses (total: ${formatEther(total)} TOKEN)`,
	});
	if (prompt.proceed) {
		const tx = await env.execute(TestTokens, {
			functionName: 'distributeAlongWithETH',
			args: [addresses, total],
			account: env.namedAccounts.tokensBeneficiary,
		});
		console.log(tx);
	}
}
main();

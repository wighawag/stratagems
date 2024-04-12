import {loadEnvironment} from 'rocketh';
import {context} from '../deploy/_context';
import {formatEther, formatUnits, parseEther, parseUnits} from 'viem';
import hre from 'hardhat';
import 'rocketh-deploy';
import prompts from 'prompts';

import {indexPlayers} from './data/players';

async function main() {
	const env = await loadEnvironment(
		{
			provider: hre.network.provider as any,
			network: hre.network.name,
		},
		context,
	);

	const state = await indexPlayers();

	const TestTokens = env.get<typeof context.artifacts.TestTokens.abi>('TestTokens');
	const decimals = await env.read(TestTokens, {functionName: 'decimals'});

	const expectedAmount = parseUnits('50', decimals);
	const newAmount = expectedAmount + (expectedAmount * 6n) / parseUnits('1', decimals);

	const toSend: {address: `0x${string}`; amount: bigint}[] = [];
	let total = 0n;
	for (const address of Object.keys(state.players)) {
		const player = state.players[address];
		if (player.tokenGiven < expectedAmount) {
			const need = newAmount - player.tokenGiven;
			toSend.push({address: address as `0x${string}`, amount: need});
			total += need;
		}
	}

	console.log(toSend);

	const prompt = await prompts({
		type: 'confirm',
		name: 'proceed',
		message: `proceed to send to ${toSend.length} addresses (total: ${formatUnits(total, decimals)} TOKEN)`,
	});
	if (prompt.proceed) {
		for (const to of toSend) {
			const tx = await env.execute(TestTokens, {
				functionName: 'transfer',
				args: [to.address, to.amount],
				account: env.accounts.tokensBeneficiary,
			});
			console.log(tx);
		}
	}
}
main();

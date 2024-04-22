import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';
import {context} from '../deploy/_context';
import {formatEther, formatUnits, parseEther, parseUnits} from 'viem';
import hre from 'hardhat';
import '@rocketh/deploy';
import prompts from 'prompts';
import {indexAll} from './data/main';

async function main() {
	const env = await loadEnvironmentFromHardhat({hre, context});

	const state = await indexAll();

	const GemsGenerator = env.get<typeof context.artifacts.RewardsGenerator.abi>('GemsGenerator');
	const decimals = await env.read(GemsGenerator, {functionName: 'decimals'});

	const toSend: {address: `0x${string}`; amount: bigint}[] = [];
	for (const address of Object.keys(state.points.shared)) {
		const currentPointsBalance = state.points.shared[address].points;
		const fromContract = await env.read(GemsGenerator, {functionName: 'balanceOf', args: [address as `0x${string}`]});
		if (currentPointsBalance != currentPointsBalance) {
			console.error(
				`${address}: ${formatUnits(currentPointsBalance, decimals)} VS ${formatUnits(fromContract, decimals)}`,
			);
		}
		const expectedBalance = state.computedPoints[address]
			? parseUnits('' + state.computedPoints[address], decimals)
			: 0n;
		if (currentPointsBalance != expectedBalance) {
			const need = expectedBalance - currentPointsBalance;
			toSend.push({address: address as `0x${string}`, amount: need});
		}
	}

	console.log(toSend);

	console.log(
		Object.keys(toSend).map((v) => ({
			address: toSend[v].address,
			amount: formatUnits(toSend[v].amount, decimals),
		})),
	);

	const prompt = await prompts({
		type: 'confirm',
		name: 'proceed',
		message: `proceed to send to ${toSend.length} addresses`,
	});
	if (prompt.proceed) {
		const enabled = await env.read(GemsGenerator, {
			functionName: 'games',
			args: [env.namedAccounts.deployer],
		});
		if (!enabled) {
			const desiredWeight = parseEther('1');
			await env.execute(GemsGenerator, {
				functionName: 'enableGame',
				args: [env.namedAccounts.deployer, desiredWeight],
				account: env.namedAccounts.deployer,
			});
		}

		for (const to of toSend) {
			if (to.amount > 0) {
				const tx = await env.execute(GemsGenerator, {
					functionName: 'add',
					args: [to.address, to.amount],
					account: env.namedAccounts.deployer,
				});
				console.log(tx);
			} else if (to.amount < 0) {
				const tx = await env.execute(GemsGenerator, {
					functionName: 'remove',
					args: [to.address, -to.amount],
					account: env.namedAccounts.deployer,
				});
				console.log(tx);
			}
		}

		await env.execute(GemsGenerator, {
			functionName: 'enableGame',
			args: [env.namedAccounts.deployer, 0n],
			account: env.namedAccounts.deployer,
		});

		for (const address of Object.keys(state.points.shared)) {
			const fromContract = await env.read(GemsGenerator, {functionName: 'balanceOf', args: [address as `0x${string}`]});
			const expectedBalance = state.computedPoints[address]
				? parseUnits('' + state.computedPoints[address], decimals)
				: 0n;
			if (fromContract != expectedBalance) {
				console.error(
					`${address}: ${formatUnits(expectedBalance, decimals)} VS ${formatUnits(fromContract, decimals)}`,
				);
			}
		}
	}
}
main();

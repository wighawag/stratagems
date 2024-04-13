import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';
import {context} from '../deploy/_context';
import {formatEther, formatUnits, parseEther, parseUnits} from 'viem';
import hre from 'hardhat';
import 'rocketh-deploy';
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

	// const toSend = [
	// 	{
	// 		address: '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
	// 		amount: -13000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xD1edDfcc4596CC8bD0bd7495beaB9B979fc50336',
	// 		amount: -1000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xa1D50E107110b293AC0CE32d648A6Bf5AC3f3612',
	// 		amount: -1000000000000000000n,
	// 	},
	// 	{
	// 		address: '0x2981000A489dD625479Bf612A29910F7De8556B4',
	// 		amount: -7000000000000000000n,
	// 	},
	// 	{
	// 		address: '0x143f8cFB7e91b7836D90A06Fe0e2cF8728D61FB0',
	// 		amount: 16000000000000000000n,
	// 	},
	// 	{
	// 		address: '0x9d35cE15c448B5a4f8afC170214F3031878396A3',
	// 		amount: 5000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xAcDb105133b8598A308995FD1EeBAaB155f1a3bf',
	// 		amount: -4000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xC6cCd3c2d63bc8De8fcF43EdE80D135666b7aceE',
	// 		amount: 11000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xF8b109aF18cfA614Bef1C2899e522d77b3C64c14',
	// 		amount: -6000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xFE35e15bE885750D9b2363cbB6aBDd57AC9C4c40',
	// 		amount: -1000000000000000000n,
	// 	},
	// 	{
	// 		address: '0x6bAFF8A3449cc2E196F4b873f49e03E09345B1E1',
	// 		amount: -8000000000000000000n,
	// 	},
	// 	{
	// 		address: '0x9dab5A6393eEf78eB36cd84bB9Bbb055189429A5',
	// 		amount: 11000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xB006c644258e01b437eFF06e16E56e938a239712',
	// 		amount: 5000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xc6a4FCe15Bd4c14f8D6ECf3Ad4e20E39021897E8',
	// 		amount: -1000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xac5b774D7a700AcDb528048B6052bc1549cd73B9',
	// 		amount: -2000000000000000000n,
	// 	},
	// 	{
	// 		address: '0xc6A55a0d7e2a7403fFEADf08A0203AF93bAD7D6e',
	// 		amount: -1000000000000000000n,
	// 	},
	// ] as const;
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
			args: [env.accounts.deployer],
		});
		if (!enabled) {
			const desiredWeight = parseEther('1');
			await env.execute(GemsGenerator, {
				functionName: 'enableGame',
				args: [env.accounts.deployer, desiredWeight],
				account: env.accounts.deployer,
			});
		}

		for (const to of toSend) {
			if (to.amount > 0) {
				const tx = await env.execute(GemsGenerator, {
					functionName: 'add',
					args: [to.address, to.amount],
					account: env.accounts.deployer,
				});
				console.log(tx);
			} else if (to.amount < 0) {
				const tx = await env.execute(GemsGenerator, {
					functionName: 'remove',
					args: [to.address, -to.amount],
					account: env.accounts.deployer,
				});
				console.log(tx);
			}
		}

		await env.execute(GemsGenerator, {
			functionName: 'enableGame',
			args: [env.accounts.deployer, 0n],
			account: env.accounts.deployer,
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

import {execute} from 'rocketh';
import 'rocketh-deploy';
import 'rocketh-deploy-proxy';
import {context} from './_context';
import {zeroAddress} from 'viem';

export default execute(
	context,
	async ({deployViaProxy, accounts, artifacts, get, getOrNull, execute, showMessage}) => {
		const {deployer, tokensBeneficiary} = accounts;

		const Gems = await get<typeof artifacts.Gems.abi>('Gems');
		const GemsGenerator = await getOrNull<typeof artifacts.RewardsGenerator.abi>('GemsGenerator');
		if (GemsGenerator) {
			// we call `update` to ensure the distribution so far is using the previous rate
			// This  and the upgrade can be done during the commit phase without running the risk
			//   of using wrong values as no changes in points are possible during that phase
			showMessage(`updating distribution before upgrade`);
			await execute(GemsGenerator, {
				functionName: 'update',
				account: deployer,
			});
		}

		await deployViaProxy(
			'GemsGenerator',
			{
				account: deployer,
				artifact: artifacts.RewardsGenerator,
				args: [
					zeroAddress, // Gems.address,
					{
						rewardRateMillionth: 0n, // TODO 100n, // 100 for every million of second. or 8.64 / day
						// in play test we add reward midway
						fixedRewardRateThousandsMillionth: 10n, // 10 for every  thousand million of seconds, or 0.000864 per day per stake or 315.36 / year / 1000 stake
					},
					[],
				],
			},
			{
				owner: accounts.deployer,
				execute: 'postUpgrade',
			},
		);
	},
	{tags: ['GemsGenerator', 'GemsGenerator_deploy'], dependencies: ['Gems_deploy']},
);

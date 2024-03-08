import {execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';
import {zeroAddress} from 'viem';

export default execute(
	context,
	async ({deployViaProxy, accounts, artifacts, get}) => {
		const {deployer, tokensBeneficiary} = accounts;

		const Gems = await get<typeof artifacts.Gems.abi>('Gems');
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

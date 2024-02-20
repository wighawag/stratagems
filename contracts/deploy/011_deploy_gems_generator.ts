import {execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';

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
					Gems.address,
					{
						rewardRateMillionth: 100n, // 100 for every million of second. or 8.64 / day
						fixedRewardRateThousandsMillionth: 10n, // 10 for every  thousand million of seconds, or 0.000864 per day per stake or 315.36 / year / 1000 stake
					},
					[],
				],
			},
			{
				owner: accounts.deployer,
			},
		);
	},
	{tags: ['GemsGenerator', 'GemsGenerator_deploy'], dependencies: ['Gems_deploy']},
);

import {deployScript, artifacts} from '../rocketh/deploy.js';
import {zeroAddress} from 'viem';
import {getConfig} from './.config/index.js';

export default deployScript(
	async (env) => {
		const {deployViaProxy, namedAccounts, get, getOrNull, execute, showMessage} = env;
		const {deterministic} = getConfig(env);
		const {deployer, tokensBeneficiary} = namedAccounts;

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

		const args = [
			zeroAddress, // Gems.address,
			{
				rewardRateMillionth: 100n, // 100 for every million of second. or 8.64 / day
				// in play test we add reward midway
				fixedRewardRateThousandsMillionth: 10n, // 10 for every  thousand million of seconds, or 0.000864 per day per stake or 315.36 / year / 1000 stake
			},
			[],
		] as const;

		const generator = await deployViaProxy(
			'GemsGenerator',
			{
				account: deployer,
				artifact: artifacts.RewardsGenerator,
				args: [...args] as any,
			},
			{
				owner: namedAccounts.deployer,
				// UNDER CREATE2 THE PROXY'S CONSTRUCTOR IS CALLED BY THE FACTORY, not
				// by the deployer, so `postUpgrade` (`onlyProxyAdmin`) would revert
				// inside it: a deterministic proxy is deployed without the call, and
				// the admin sends it below. It is idempotent (it only sets `_init`
				// when there are no initial games), so the state is the same.
				...(deterministic ? {deterministic, deterministicImplementation: true} : {execute: 'postUpgrade'}),
			},
		);
		if (deterministic) {
			await execute(generator, {
				functionName: 'postUpgrade',
				args: [...args] as any,
				account: deployer,
			});
		}
	},
	{tags: ['GemsGenerator', 'GemsGenerator_deploy'], dependencies: ['Gems_deploy']},
);

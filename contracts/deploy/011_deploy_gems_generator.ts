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
				// A GAS LIMIT OF ITS OWN, not the node's estimate: what `update` costs
				// depends on the time since the last update, and the offline world's
				// in-tab node estimates at the LAST MINED block's timestamp
				// (web/src/lib/embedded/node.ts), which is the last update's when that
				// block touched the generator, so the estimate takes the cheap path and
				// the transaction, mined later, runs out of gas ("The offline world did
				// not start" after a reload, found in step L3 of
				// work/plans/join-template-commit-reveal.md once a guarded setup call no
				// longer mined a block before it). Measured 50,415 gas at most (the first
				// update after the deploy), 33,315 after.
				gas: 100_000n,
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
			// GUARDED BY ITS ONLY EFFECT, `_init`, which has no view: it is the whole of
			// slot 0 in `RewardsGenerator`'s storage layout (offset 0, the next variable,
			// `_global`, a struct, starts slot 1; `Proxied` keeps its own in EIP-1967
			// slots), so the word is 1 once it ran. Read on the proxy, where the
			// storage is. A LAN box replays the call only when the word is not that
			// (`rocketh/guard-recording.ts`).
			await execute(generator, {
				functionName: 'postUpgrade',
				args: [...args] as any,
				account: deployer,
				guard: {
					kind: 'storage',
					slot: '0x0000000000000000000000000000000000000000000000000000000000000000',
					as: 'bool',
					equals: true,
				},
			});
		}
	},
	{tags: ['GemsGenerator', 'GemsGenerator_deploy'], dependencies: ['Gems_deploy']},
);

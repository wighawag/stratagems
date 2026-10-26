import {deployScript, artifacts} from '../rocketh/deploy.js';

export default deployScript(
	async ({deploy, execute, get, namedAccounts, name}) => {
		const {deployer} = namedAccounts;

		const TestTokens = await get<typeof artifacts.TestTokens.abi>('TestTokens');

		// Anyone may take test gems from it (`topup()`, 15 a call): the local chain's
		// way to get gems (the HUD's "Get test gems"), and the offline world's, for
		// the human and for the seats the world plays. Never on a live chain: how a
		// live chain hands out gems is step D's (work/plans/join-template-commit-reveal.md).
		if (name == 'localhost' || name == 'offline') {
			const TestTokensDistributor = await deploy('TestTokensDistributor', {
				account: deployer,
				artifact: artifacts.TestTokensInfiniteDistributor,
				args: [TestTokens.address],
			});

			await execute(TestTokens, {
				functionName: 'authorizeMinters',
				args: [[TestTokensDistributor.address], true],
				account: deployer,
			});
		}
	},
	{tags: ['TestTokensDistributor', 'TestTokensDistributor_deploy'], dependencies: ['TestTokens_deploy']},
);

import {deployScript, artifacts} from '../rocketh/deploy.js';

export default deployScript(
	async ({deploy, execute, get, namedAccounts, name}) => {
		const {deployer} = namedAccounts;

		const TestTokens = await get<typeof artifacts.TestTokens.abi>('TestTokens');

		// TODO
		if (name == 'localhost') {
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

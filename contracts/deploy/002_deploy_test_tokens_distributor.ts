import {execute} from 'rocketh';
import '@rocketh/deploy';
import {context} from './_context';

export default execute(
	context,
	async ({deploy, execute, get, namedAccounts, artifacts, network}) => {
		const {deployer} = namedAccounts;

		const TestTokens = await get<typeof artifacts.TestTokens.abi>('TestTokens');

		// TODO
		if (network.name == 'localhost') {
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

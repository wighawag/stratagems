import {deployScript, artifacts} from '../rocketh/deploy.js';
import {parseEther} from 'viem';

export default deployScript(
	async ({deploy, execute, get, namedAccounts, name}) => {
		const {deployer} = namedAccounts;

		const TestTokens = await get<typeof artifacts.TestTokens.abi>('TestTokens');

		// Anyone may take test gems from it (`topup()`, one stake a call): the local
		// chain's way to get gems (the HUD's "Get test gems"), the offline world's,
		// for the human and for the seats the world plays, and the `alpha2` test
		// deployment's, where test gems are worth nothing (step D, PD4, of
		// work/plans/join-template-commit-reveal.md). Not on a chain whose tokens
		// are worth something: alpha1's had claim links.
		if (name == 'localhost' || name == 'offline' || name == 'alpha2') {
			const TestTokensDistributor = await deploy('TestTokensDistributor', {
				account: deployer,
				artifact: artifacts.TestTokensInfiniteDistributor,
				// ONE STAKE A CALL: the game's `actionsPerReveal` (32, `020_deploy_game.ts`)
				// gems, what the HUD stakes, so a new player presses once and not three
				// times (15 a call until step D).
				args: [TestTokens.address, parseEther('32')],
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

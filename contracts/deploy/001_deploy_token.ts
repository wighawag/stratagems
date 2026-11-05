import {deployScript, artifacts} from '../rocketh/deploy.js';

export default deployScript(
	async ({deploy, namedAccounts}) => {
		const {deployer} = namedAccounts;

		// Deterministic (CREATE2), like every contract here: see "Deterministic
		// deployments" in README.md.
		await deploy(
			'GameToken',
			{
				account: deployer,
				artifact: artifacts.GameToken,
				args: [],
			},
			{deterministic: true},
		);
	},
	{tags: ['GameToken', 'GameToken_deploy']},
);

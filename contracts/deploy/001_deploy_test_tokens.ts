import {deployScript, artifacts} from '../rocketh/deploy.js';
import {parseEther} from 'viem';
import {getConfig} from './.config/index.js';

export default deployScript(
	async (env) => {
		const {deploy, namedAccounts} = env;
		const {deterministic} = getConfig(env);
		const {deployer, tokensBeneficiary} = namedAccounts;

		const config = {admin: deployer};

		const TestTokens = await deploy('TestTokens', {
			account: deployer,
			artifact: artifacts.TestTokens,
			args: [tokensBeneficiary, parseEther('1000000000'), config], // 18 decimal like ether
		}, {deterministic});
	},
	{tags: ['TestTokens', 'TestTokens_deploy']},
);

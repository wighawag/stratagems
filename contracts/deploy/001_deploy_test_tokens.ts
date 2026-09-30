import {deployScript, artifacts} from '../rocketh/deploy.js';
import {parseEther} from 'viem';

export default deployScript(
	async ({deploy, namedAccounts}) => {
		const {deployer, tokensBeneficiary} = namedAccounts;

		const config = {admin: deployer};

		const TestTokens = await deploy('TestTokens', {
			account: deployer,
			artifact: artifacts.TestTokens,
			args: [tokensBeneficiary, parseEther('1000000000'), config], // 18 decimal like ether
		});
	},
	{tags: ['TestTokens', 'TestTokens_deploy']},
);

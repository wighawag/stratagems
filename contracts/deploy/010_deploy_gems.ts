import {deployScript, artifacts} from '../rocketh/deploy.js';
import {parseEther} from 'viem';
import {getConfig} from './.config/index.js';

export default deployScript(
	async (env) => {
		const {deploy, namedAccounts} = env;
		const {deterministic} = getConfig(env);
		const {deployer, tokensBeneficiary} = namedAccounts;
		await deploy('Gems', {
			account: deployer,
			artifact: artifacts.Gems,
			args: [deployer, tokensBeneficiary, parseEther('1000')], // 18 decimal like ether
		}, {deterministic});
	},
	{tags: ['Gems', 'Gems_deploy']},
);

import {deployScript, artifacts} from '../rocketh/deploy.js';
import {parseEther} from 'viem';

export default deployScript(
	async ({deploy, namedAccounts}) => {
		const {deployer, tokensBeneficiary} = namedAccounts;
		await deploy('Gems', {
			account: deployer,
			artifact: artifacts.Gems,
			args: [deployer, tokensBeneficiary, parseEther('1000')], // 18 decimal like ether
		});
	},
	{tags: ['Gems', 'Gems_deploy']},
);

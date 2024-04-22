import {execute} from 'rocketh';
import '@rocketh/deploy-proxy';
import {context} from './_context';
import {parseEther} from 'viem';

export default execute(
	context,
	async ({deploy, namedAccounts, artifacts}) => {
		const {deployer, tokensBeneficiary} = namedAccounts;
		await deploy('Gems', {
			account: deployer,
			artifact: artifacts.Gems,
			args: [deployer, tokensBeneficiary, parseEther('1000')], // 18 decimal like ether
		});
	},
	{tags: ['Gems', 'Gems_deploy']},
);

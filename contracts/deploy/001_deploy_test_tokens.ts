import {execute} from 'rocketh';
import 'rocketh-deploy';
import {context} from './_context';
import {parseEther} from 'viem';

export default execute(
	context,
	async ({deploy, accounts, artifacts}) => {
		const {deployer, tokensBeneficiary} = accounts;

		const config = {fee: 0n, feeReceiver: deployer};
		

		await deploy('TestTokens', {
			account: deployer,
			artifact: artifacts.TestTokens,
			args: [tokensBeneficiary, parseEther('1000000000'), config], // 18 decimal like ether
		});
	},
	{tags: ['TestTokens', 'TestTokens_deploy']},
);

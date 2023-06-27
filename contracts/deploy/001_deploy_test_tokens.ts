import {execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';
import {parseEther} from 'viem';

export default execute(
	context,
	async ({deployViaProxy, accounts, artifacts}) => {
		const {deployer, tokensBeneficiary} = accounts;
		await deployViaProxy(
			'TestTokens',
			{
				account: deployer,
				artifact: artifacts.TestTokens,
				args: [tokensBeneficiary, parseEther('1000000000')], // 18 decimal like ether
			},
			{
				owner: accounts.deployer,
			}
		);
	},
	{tags: ['TestTokens', 'TestTokens_deploy']}
);

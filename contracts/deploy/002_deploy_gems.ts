import {execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';

export default execute(
	context,
	async ({deployViaProxy, accounts, artifacts}) => {
		const {deployer, tokensBeneficiary} = accounts;
		await deployViaProxy(
			'Gems',
			{
				account: deployer,
				artifact: artifacts.TestTokens,
				args: [tokensBeneficiary, 1000000000000000000000000000n], // 1billion of token (decimal 18)
			},
			{
				owner: accounts.deployer,
			}
		);
	},
	{tags: ['Gems', 'Gems_deploy']}
);

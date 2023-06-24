import {execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';

export default execute(
	context,
	async ({deployViaProxy, accounts, artifacts}) => {
		const {deployer} = accounts;
		await deployViaProxy(
			'TestTokens',
			{
				account: deployer,
				artifact: artifacts.TestTokens,
				args: [deployer, 1000000000000000000000000000n], // 1billion of token (decimal 18)
			},
			{
				owner: accounts.deployer,
			}
		);
	},
	{tags: ['TestTokens', 'TestTokens_deploy']}
);

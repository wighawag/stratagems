import {Deployment, execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import {context} from './_context';
import {contract} from '../utils/viem';
import {minutes} from '../utils/time';

export default execute(
	context,
	async ({deployViaProxy, deployments, accounts, artifacts}) => {
		const {deployer, tokensBeneficiary} = accounts;

		const TestTokens = contract(deployments.TestTokens as Deployment<typeof context.artifacts.TestTokens.abi>);
		const timestamp = BigInt(Math.floor(Date.now() / 1000));

		const decimals = await TestTokens.read.decimals();

		const config = {
			tokens: TestTokens.address,
			// startTime: nextSunday(),
			startTime: timestamp, // nextSunday(),
			// commitPeriod: days(2.5), // TODO support more complex period to support a special weekend commit period
			commitPeriod: BigInt(minutes(5)), // days(2.5), // TODO support more complex period to support a special weekend commit period
			// resolutionPeriod: days(1),
			resolutionPeriod: BigInt(minutes(5)), // days(1),
			maxLife: 5,
			decimals,
		};

		await deployViaProxy(
			'Stratagems',
			{
				account: deployer,
				artifact: artifacts.Stratagems,
				args: [config], // 1billion of token (decimal 18)
			},
			{
				owner: accounts.deployer,
			}
		);
	},
	{tags: ['Stratagems', 'Stratagems_deploy'], dependencies: ['TestTokens_deploy', 'Gems_deploy']}
);

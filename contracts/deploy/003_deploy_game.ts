import {Deployment, execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import 'rocketh-deploy-router';
import {context} from './_context';
import {contract} from '../utils/viem';
import {minutes} from '../utils/time';

export default execute(
	context,
	async ({deployViaProxy, deployments, accounts, artifacts, network, deployViaRouter}) => {
		const {deployer} = accounts;

		const TestTokens = contract(deployments.TestTokens as Deployment<typeof context.artifacts.TestTokens.abi>);
		const timestamp = BigInt(Math.floor(Date.now() / 1000));

		const decimals = BigInt(await TestTokens.read.decimals());

		const config = {
			tokens: TestTokens.address,
			numTokensPerGems: BigInt(2) ** decimals,
			burnAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
			// startTime: nextSunday(),
			startTime: timestamp, // nextSunday(),
			// commitPeriod: days(2.5), // TODO support more complex period to support a special weekend commit period
			commitPhaseDuration: BigInt(minutes(5)), // days(2.5), // TODO support more complex period to support a special weekend commit period
			// resolutionPeriod: days(1),
			resolutionPhaseDuration: BigInt(minutes(5)), // days(1),
			maxLife: 5,
		};

		// we use a debug artifact unless mainnet
		// the debug artifact must have the same initialisation arguments as the default artifact
		const artifact = (
			network.tags['mainnet'] ? artifacts.Stratagems_debug : artifacts.Stratagems
		) as typeof artifacts.Stratagems;

		await deployViaProxy(
			'Stratagems',
			{
				account: deployer,
				artifact,
				args: [config], // 1billion of token (decimal 18)
			},
			{
				owner: accounts.deployer,
				deployImplementation: (name, args) => {
					return deployViaRouter(
						name,
						{
							...(args as any),
						},
						[{name: 'Core', artifact: artifacts.StratagemsCore, args: [config]}]
					) as any;
				},
			}
		);
	},
	{
		tags: ['Stratagems', 'Stratagems_deploy'],
		dependencies: ['TestTokens_deploy', 'Gems_deploy'],
	}
);

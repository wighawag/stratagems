import {Deployment, execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import 'rocketh-deploy-router';
import {context} from './_context';
import {contract} from '../utils/viem';
import {minutes} from '../utils/time';
import {zeroAddress} from 'viem';

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
			burnAddress: zeroAddress,
			// startTime: nextSunday(),
			startTime: timestamp, // nextSunday(),
			// commitPeriod: days(2.5), // TODO support more complex period to support a special weekend commit period
			commitPhaseDuration: BigInt(minutes(5)), // days(2.5), // TODO support more complex period to support a special weekend commit period
			// resolutionPeriod: days(1),
			resolutionPhaseDuration: BigInt(minutes(5)), // days(1),
			maxLife: 5,
		};

		const routes = [
			{name: 'Core', artifact: artifacts.StratagemsCore, args: [config]},
			{name: 'ERC721', artifact: artifacts.StratagemsERC721 as any, args: [config]},
		];
		if (!network.tags['mainnet']) {
			routes.push({name: 'Debug', artifact: artifacts.StratagemsDebug as any, args: [config]});
		}

		await deployViaProxy(
			'Stratagems',
			{
				account: deployer,
				artifact: (name, args) => {
					return deployViaRouter(
						name,
						{
							...(args as any),
						},
						routes
					) as Promise<Deployment<typeof artifacts.IStratagems.abi>>;
				},
				args: [config],
			},
			{
				owner: accounts.deployer,
			}
		);
	},
	{
		tags: ['Stratagems', 'Stratagems_deploy'],
		dependencies: ['TestTokens_deploy', 'Gems_deploy'],
	}
);

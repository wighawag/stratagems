import {Deployment, execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import 'rocketh-deploy-router';
import {context} from './_context';
import {fetchContract} from '../utils/connection';
import {minutes} from '../utils/time';
import {zeroAddress} from 'viem';

export type GameConfig = {
	tokens: `0x${string}`;
	numTokensPerGems: bigint;
	burnAddress: `0x${string}`;
	startTime: number;
	commitPhaseDuration: bigint;
	resolutionPhaseDuration: bigint;
	maxLife: number;
};

export default execute(
	context,
	async (
		{deployViaProxy, deployments, accounts, artifacts, network, deployViaRouter},
		configOverride?: Partial<GameConfig>
	) => {
		const {deployer} = accounts;

		const TestTokens = await fetchContract(deployments.TestTokens as Deployment<typeof context.artifacts.TestTokens.abi>);
		const timestamp = 0; // BigInt(Math.floor(Date.now() / 1000));

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
			maxLife: 6,
			...configOverride,
		};

		const routes = [
			{name: 'Core', artifact: artifacts.StratagemsGameplay, args: [config]},
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

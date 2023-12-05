import {Deployment, execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import 'rocketh-deploy-router';
import {context} from './_context';
import {fetchContract} from '../utils/connection';
import {days, hours, minutes} from '../utils/time';
import {zeroAddress} from 'viem';

export type GameConfig = {
	tokens: `0x${string}`;
	numTokensPerGems: bigint;
	burnAddress: `0x${string}`;
	startTime: number;
	commitPhaseDuration: bigint;
	revealPhaseDuration: bigint;
	maxLife: number;
};

export default execute(
	context,
	async (
		{deployViaProxy, deployments, accounts, artifacts, network, deployViaRouter},
		configOverride?: Partial<GameConfig>,
	) => {
		const {deployer} = accounts;

		const startTime = 0; // BigInt(Math.floor(Date.now() / 1000)); // startTime: nextSunday(),

		const TestTokens = await fetchContract(
			deployments.TestTokens as Deployment<typeof context.artifacts.TestTokens.abi>,
		);
		let decimals = BigInt(await TestTokens.read.decimals());
		let symbol = await TestTokens.read.symbol();
		let name = await TestTokens.read.name();

		if (configOverride?.tokens == zeroAddress) {
			// TODO per network
			decimals = 18n;
			symbol = 'ETH';
			name = 'Ethers';
		}

		const numTokensPerGems = BigInt(10) ** decimals;

		const admin = accounts.deployer;

		let time: `0x${string}` = zeroAddress;
		const timeContract = await deployments['Time'];
		if (timeContract && !network.tags['mainnet']) {
			time = timeContract.address;
		}

		const config = {
			tokens: TestTokens.address,
			numTokensPerGems,
			burnAddress: `0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD`, //zeroAddress,

			startTime,
			commitPhaseDuration: BigInt(days(1)) - BigInt(hours(1)), // BigInt(minutes(5)), // TODO support more complex period to support a special weekend commit period
			revealPhaseDuration: BigInt(hours(1)),
			maxLife: 7, // 7 is a good number, because with 4 enemy neighbors, it take 2 turns to die, with 3 it takes 3, with 2 it takes 4, with 1 it takes 7
			time,
			...configOverride,
		};

		const routes = [
			{name: 'Getters', artifact: artifacts.StratagemsGetters, args: [config]},
			{name: 'Setters', artifact: artifacts.StratagemsSetters, args: [config]},
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
						routes,
					) as Promise<Deployment<typeof artifacts.IStratagems.abi>>;
				},
				args: [config],
			},
			{
				owner: admin,
				linkedData: {
					...config,
					currency: {
						symbol,
						name,
						decimals,
					},
					admin,
				},
			},
		);
	},
	{
		tags: ['Stratagems', 'Stratagems_deploy'],
		dependencies: ['TestTokens_deploy', 'Gems_deploy'],
	},
);

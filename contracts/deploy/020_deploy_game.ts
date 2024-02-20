import {Deployment, execute} from 'rocketh';
import 'rocketh-deploy-proxy';
import 'rocketh-deploy-router';
import {context} from './_context';
import {fetchContract} from '../utils/connection';
import {days, hours, minutes} from '../utils/time';
import {checksumAddress, parseEther, zeroAddress} from 'viem';
import {getConfig} from './.config';

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
	async (env, configOverride?: Partial<GameConfig>) => {
		const {deployViaProxy, deployments, accounts, artifacts, network, deployViaRouter, get} = env;
		const {deployer} = accounts;
		const deployConfig = getConfig(env);

		const startTime = 0; // BigInt(Math.floor(Date.now() / 1000)); // startTime: nextSunday(),

		const generator = get<typeof artifacts.RewardsGenerator.abi>('GemsGenerator');

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
		if (timeContract && deployConfig.useTimeContract) {
			time = timeContract.address;
		}

		// TODO support more complex period to support a special weekend commit period ?
		let revealPhaseDuration = BigInt(hours(1));
		let commitPhaseDuration = BigInt(days(1)) - revealPhaseDuration;

		if (network.name === 'fast') {
			revealPhaseDuration = BigInt(minutes(3));
			commitPhaseDuration = BigInt(minutes(8)) - revealPhaseDuration;
		}

		const config = {
			tokens: TestTokens.address,
			numTokensPerGems,
			burnAddress: checksumAddress(`0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD`), //zeroAddress,

			startTime,
			revealPhaseDuration,
			commitPhaseDuration,
			maxLife: 7, // 7 is a good number, because with 4 enemy neighbors, it take 2 turns to die, with 3 it takes 3, with 2 it takes 4, with 1 it takes 7
			time,
			...configOverride,
			generator: generator.address,
		};

		const routes = [
			{name: 'Getters', artifact: artifacts.StratagemsGetters, args: [config], account: deployer},
			{name: 'Setters', artifact: artifacts.StratagemsSetters, args: [config], account: deployer},
			{name: 'ERC721', artifact: artifacts.StratagemsERC721 as any, args: [config], account: deployer},
		];
		if (!network.tags['mainnet']) {
			routes.push({name: 'Debug', artifact: artifacts.StratagemsDebug as any, args: [config], account: deployer});
		}

		const stratagems = await deployViaProxy<typeof artifacts.IStratagems.abi>(
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

		await env.execute(generator, {
			account: deployer,
			functionName: 'enableGame',
			args: [stratagems.address, parseEther('1')],
		});
	},
	{
		tags: ['Stratagems', 'Stratagems_deploy'],
		dependencies: ['TestTokens_deploy', 'Gems_deploy'],
	},
);

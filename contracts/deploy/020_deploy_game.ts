import {deployScript, artifacts} from '../rocketh/deploy.js';
import type {Deployment} from 'rocketh/types';
import {Abi_IStratagems} from '../generated/abis/IStratagems.js';
import {Abi_UsingStratagemsDebugEvents} from '../generated/abis/UsingStratagemsDebugEvents.js';
import {days, hours, minutes} from '../utils/time.js';
import {checksumAddress, parseEther, zeroAddress} from 'viem';
import {getConfig} from './.config/index.js';

export type GameConfig = {
	tokens: `0x${string}`;
	numTokensPerGems: bigint;
	burnAddress: `0x${string}`;
	startTime: number;
	commitPhaseDuration: bigint;
	revealPhaseDuration: bigint;
	maxLife: number;
};

export default deployScript(
	async (env, configOverride?: Partial<GameConfig>) => {
		const {deployViaProxy, deployments, namedAccounts, deployViaRouter, get} = env;
		const {deployer} = namedAccounts;
		const deployConfig = getConfig(env);

		const startTime = 0; // BigInt(Math.floor(Date.now() / 1000)); // startTime: nextSunday(),

		const generator = get<typeof artifacts.RewardsGenerator.abi>('GemsGenerator');
		const testTokens = get<typeof artifacts.TestTokens.abi>('TestTokens');

		let decimals = await env.read(testTokens, {functionName: 'decimals'});
		let symbol = await env.read(testTokens, {functionName: 'symbol'});
		let name = await env.read(testTokens, {functionName: 'name'});

		if (configOverride?.tokens == zeroAddress) {
			// TODO per network
			decimals = 18;
			symbol = 'ETH';
			name = 'Ethers';
		}

		const numTokensPerGems = BigInt(10) ** BigInt(decimals);

		const admin = namedAccounts.deployer;

		let time: `0x${string}` = zeroAddress;
		const timeContract = await deployments['Time'];
		if (timeContract && deployConfig.useTimeContract) {
			time = timeContract.address;
		}

		// TODO support more complex period to support a special weekend commit period ?
		let revealPhaseDuration = BigInt(hours(1));
		let commitPhaseDuration = BigInt(days(1)) - revealPhaseDuration;

		if (env.name === 'fast') {
			revealPhaseDuration = BigInt(minutes(3));
			commitPhaseDuration = BigInt(minutes(8)) - revealPhaseDuration;
		}

		const config = {
			tokens: testTokens.address,
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
			{name: 'Getters', artifact: artifacts.StratagemsGetters, args: [config]},
			{name: 'Commit', artifact: artifacts.StratagemsCommit, args: [config]},
			{name: 'Reveal', artifact: artifacts.StratagemsReveal, args: [config]},
			{name: 'Poke', artifact: artifacts.StratagemsPoke, args: [config]},
			{name: 'ERC721', artifact: artifacts.StratagemsERC721 as any, args: [config]},
		];
		if (env.name === 'hardhat' || env.name === 'memory' || env.name === 'default') {
			routes.push({name: 'Debug', artifact: artifacts.StratagemsDebug as any, args: [config]});
		}

		const stratagems = await deployViaProxy<Abi_IStratagems>(
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
						{extraABIs: [Abi_UsingStratagemsDebugEvents]},
					) as Promise<Deployment<Abi_IStratagems>>;
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

		const desiredWeight = parseEther('1');
		const weight = await env.read(generator, {
			functionName: 'games',
			args: [stratagems.address],
		});

		if (weight != desiredWeight) {
			await env.execute(generator, {
				account: deployer,
				functionName: 'enableGame',
				args: [stratagems.address, desiredWeight],
			});
		}

		const globalApproval = await env.read(testTokens, {
			functionName: 'globalApprovals',
			args: [stratagems.address],
		});

		if (!globalApproval) {
			await env.execute(testTokens, {
				account: deployer,
				functionName: 'authorizeGlobalApprovals',
				args: [[stratagems.address], true],
			});
		}

		const addressesToAuthorize = Object.values(env.namedAccounts).concat([stratagems.address]);
		const anyNotAuthorized = await env.read(testTokens, {
			functionName: 'anyNotAuthorized',
			args: [addressesToAuthorize],
		});
		if (anyNotAuthorized) {
			await env.execute(testTokens, {
				account: deployer,
				functionName: 'enableRequireAuthorization',
				args: [addressesToAuthorize],
			});
		}
	},
	{
		tags: ['Stratagems', 'Stratagems_deploy'],
		dependencies: ['TestTokens_deploy', 'Gems_deploy'],
	},
);

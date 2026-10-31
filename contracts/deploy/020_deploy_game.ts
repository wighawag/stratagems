import {deployScript, artifacts} from '../rocketh/deploy.js';
import type {Deployment} from 'rocketh/types';
import {Abi_IStratagems} from '../generated/abis/IStratagems.js';
import {Abi_UsingStratagemsDebugEvents} from '../generated/abis/UsingStratagemsDebugEvents.js';
import {days, hours, minutes} from '../utils/time.js';
import {checksumAddress, parseEther, zeroAddress} from 'viem';
import {getConfig} from './.config/index.js';
import {CLIENT_GAS} from './.config/gas.js';

export type GameConfig = {
	tokens: `0x${string}`;
	numTokensPerGems: bigint;
	burnAddress: `0x${string}`;
	startTime: number;
	commitPhaseDuration: bigint;
	revealPhaseDuration: bigint;
	maxLife: number;
	actionsPerReveal: bigint;
	cyclePolicy: number;
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

		// The local chain (`pnpm start`, and the e2e suite, whose waits are sized
		// against it): the template's own local durations, a 40 s cycle. Ten seconds
		// of reveal is the template's floor for one reveal on a local chain (its
		// rocketh/config.ts says why); a turn here is one chunk.
		if (env.name === 'localhost') {
			revealPhaseDuration = 10n;
			commitPhaseDuration = 30n;
		}

		if (env.name === 'fast') {
			revealPhaseDuration = BigInt(minutes(3));
			commitPhaseDuration = BigInt(minutes(8)) - revealPhaseDuration;
		}

		// the base's CyclePolicy: 0 Timed (the clock decides), 1 Manual (the cycle
		// moves when everyone has acted and someone pushes it)
		let cyclePolicy = 0;

		// THE OFFLINE WORLD (`web/src/lib/offline.ts`, a chain in the player's tab):
		// the Manual policy with both durations zero, one decision and not three,
		// since the contract refuses durations that disagree with the policy. An
		// automined chain in a tab has no clock between transactions, so a timed
		// cycle there could not even estimate a reveal once its commit phase closed,
		// and an offline game is the human's to pace. Its own environment rather than
		// `localhost`, so that what an offline game is cannot change what a
		// developer's local chain is.
		if (env.name === 'offline') {
			revealPhaseDuration = 0n;
			commitPhaseDuration = 0n;
			cyclePolicy = 1;
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
			// the commit-reveal base's: a reveal carries at most 32 moves (alpha1's
			// MAX_NUM_MOVES_PER_HASH), and the cycle's policy (above)
			actionsPerReveal: 32n,
			cyclePolicy,
			...configOverride,
			generator: generator.address,
		};

		const routes = [
			{name: 'Getters', artifact: artifacts.StratagemsGetters, args: [config]},
			{name: 'Commit', artifact: artifacts.StratagemsCommit, args: [config]},
			{name: 'Reveal', artifact: artifacts.StratagemsReveal, args: [config]},
			{name: 'Poke', artifact: artifacts.StratagemsPoke, args: [config]},
			{name: 'ERC721', artifact: artifacts.StratagemsERC721 as any, args: [config]},
			// who may act for whom (the base's `_playerOf`); takes no config
			{name: 'Delegation', artifact: artifacts.StratagemsDelegation as any, args: []},
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
				// The client's gas figures beside the contract's config, not in it: the
				// contract never reads them (see .config/gas.ts).
				linkedData: {
					...config,
					...CLIENT_GAS,
					currency: {
						symbol,
						name,
						decimals,
					},
					admin,
				},
			},
		);

		// WHAT A TURN WILL DO, answered by the reveal's own code: the resolution,
		// unchanged, over storage of its own (`StratagemsSimulation.sol` says why it
		// is a contract of its own and never a route). The same config, because its
		// immutables are the rules' parameters; nothing is ever sent to it, the
		// client runs its deployed code in a sandbox (`web/src/lib/game/simulation`).
		await env.deploy('StratagemsSimulation', {
			account: deployer,
			artifact: artifacts.StratagemsSimulation,
			args: [{...config, startTime: BigInt(config.startTime)}],
		});

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

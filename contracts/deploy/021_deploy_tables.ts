import {deployScript, artifacts} from '../rocketh/deploy.js';
import {Abi_UsingStratagemsDebugEvents} from '../generated/abis/UsingStratagemsDebugEvents.js';
import {checksumAddress} from 'viem';
import {CLIENT_GAS} from './.config/gas.js';
import {getConfig} from './.config/index.js';

/**
 * TABLES: stratagems games for a fixed set of players, created by anyone, beside
 * the persistent world (step L2 of work/plans/join-template-commit-reveal.md).
 *
 * A table is an ADDRESS of its own, an EIP-1167 clone of one implementation
 * made by the base's `CommitRevealGameFactory`, which also opens its roster.
 * The implementation is the world's routes (without Debug) plus the base's
 * lobby route, `CommitRevealLobby`, behind a router WITHOUT a proxy: nothing
 * upgrades a table. Every table plays by the implementation's immutables, so
 * its config (below) is the factory's linked data, where a client finds it.
 *
 * Named 021 and not 030 because `.offshoot-omissions` deletes the template's
 * `030_deploy_lobby.ts` by path on every cascade.
 *
 * Runs wherever the world's script runs, except the offline world: an in-tab
 * chain has nobody to invite (hotseat is step H's). The world is untouched: it
 * has no lobby route, so nothing can open a roster on it.
 */

/** The base's `CyclePolicy.TimedWithEarlyAdvance`. */
const TIMED_WITH_EARLY_ADVANCE = 2;

/**
 * A CELL STORES ITS CYCLE IN 24 BITS (`_currentCycle`), and minute-long cycles
 * counted from 1970 are about 29 million, past them. Counted from 2025-01-01
 * they fit for 30 years at a minute, and longer at the `lan` durations. A fixed
 * date, so a redeploy does not move the clock. `_startGame` re-anchors at the
 * grid's cycle, so this still decides the numbers a table plays.
 */
const TABLE_START_TIME = 1_735_689_600n;

/** A table's phases, in seconds, by environment (PL2-4). */
function tableDurations(envName: string): {commitPhaseDuration: bigint; revealPhaseDuration: bigint} {
	// the local chain and the tests: the template's lobby durations, which its
	// two-browser e2e's waits are sized for
	if (
		envName === 'localhost' ||
		envName === 'hardhat' ||
		envName === 'memory' ||
		envName === 'default' ||
		envName === 'test'
	) {
		return {commitPhaseDuration: 45n, revealPhaseDuration: 15n};
	}
	// `lan` (a box of the user's) and, until step D-live says otherwise, every
	// live environment: three minutes to plan, one to reveal
	return {commitPhaseDuration: 180n, revealPhaseDuration: 60n};
}

export default deployScript(
	async (env) => {
		if (env.name === 'offline') {
			return;
		}
		const {deploy, deployViaRouter, namedAccounts, get} = env;
		const {deployer} = namedAccounts;
		const {deterministic} = getConfig(env);

		const world = get('Stratagems');
		const testTokens = get<typeof artifacts.TestTokens.abi>('TestTokens');
		const worldConfig = world.linkedData as Record<string, unknown> & {
			currency: {symbol: string; name: string; decimals: number};
			admin: `0x${string}`;
		};

		const noRewards = await deploy('NoRewards', {
			account: deployer,
			artifact: artifacts.NoRewards,
		}, {deterministic});

		const config = {
			tokens: testTokens.address,
			numTokensPerGems: BigInt(10) ** BigInt(worldConfig.currency.decimals),
			burnAddress: checksumAddress(`0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD`),
			startTime: TABLE_START_TIME,
			...tableDurations(env.name),
			maxLife: 7,
			time: worldConfig.time as `0x${string}`,
			actionsPerReveal: 32n,
			cyclePolicy: TIMED_WITH_EARLY_ADVANCE,
			// no rewards at a table, by design (PL2-2)
			generator: noRewards.address,
		};

		const implementation = await deployViaRouter(
			'StratagemsTableImplementation',
			{account: deployer},
			[
				{name: 'Getters', artifact: artifacts.StratagemsGetters, args: [config]},
				{name: 'Commit', artifact: artifacts.StratagemsCommit, args: [config]},
				{name: 'Reveal', artifact: artifacts.StratagemsReveal, args: [config]},
				{name: 'Poke', artifact: artifacts.StratagemsPoke, args: [config]},
				{name: 'ERC721', artifact: artifacts.StratagemsERC721 as any, args: [config]},
				{name: 'Delegation', artifact: artifacts.StratagemsDelegation as any, args: []},
				// the base's own lobby route, the same for every game: it takes only
				// the cycle's half of the config
				{
					name: 'Lobby',
					artifact: artifacts.CommitRevealLobby,
					args: [
						{
							startTime: config.startTime,
							commitPhaseDuration: config.commitPhaseDuration,
							revealPhaseDuration: config.revealPhaseDuration,
							time: config.time,
							actionsPerReveal: config.actionsPerReveal,
							cyclePolicy: config.cyclePolicy,
						},
					],
				},
			],
			{extraABIs: [Abi_UsingStratagemsDebugEvents], deterministic},
		);

		// what a table's moves will do, answered by the reveal's own code over
		// storage of its own, with the table's rules (020 says why it is a
		// contract and never a route)
		await deploy('StratagemsTableSimulation', {
			account: deployer,
			artifact: artifacts.StratagemsSimulation,
			args: [config],
		}, {deterministic});

		await deploy(
			'StratagemsTableFactory',
			{
				account: deployer,
				artifact: artifacts.CommitRevealGameFactory,
				args: [implementation.address],
			},
			{
				// every table's rules, where a client finds them: a table's record is
				// the world's with this in place of the world's linked data
				linkedData: {
					...config,
					startTime: Number(config.startTime),
					...CLIENT_GAS,
					currency: worldConfig.currency,
					admin: worldConfig.admin,
				},
				deterministic,
			},
		);
	},
	{
		tags: ['StratagemsTables', 'StratagemsTables_deploy'],
		dependencies: ['Stratagems_deploy'],
	},
);

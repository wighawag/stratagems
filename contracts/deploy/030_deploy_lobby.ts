import {Abi_GameToken} from '../generated/abis/GameToken.js';
import {Abi_IGameLobby} from '../generated/abis/IGameLobby.js';
import {Abi_CommitRevealGameFactory} from '../generated/abis/CommitRevealGameFactory.js';
import {deployScript, artifacts} from '../rocketh/deploy.js';
import {parseEther, zeroAddress} from 'viem';

/**
 * GAMES FOR A FIXED SET OF PLAYERS, beside the persistent world.
 *
 * One lobby implementation, the same routes as the world's `Game` plus the
 * base's `CommitRevealLobby`, built with the lobby's config (`data.Lobby`),
 * and a factory that clones it per table. The implementation is a router WITHOUT a proxy: nothing
 * upgrades a table, and a clone delegates to the router, which delegates to
 * the routes, so each table's storage is its own.
 *
 * The world's `Game` is untouched: it has no lobby route, so nothing can
 * open a roster on it and its entry stays open.
 */
export default deployScript(
	async ({get, deploy, deployViaRouter, namedAccounts, data}) => {
		const {deployer} = namedAccounts;

		const GameToken = get<Abi_GameToken>('GameToken');

		const config = {
			startTime: 0n,
			commitPhaseDuration: data.Lobby.commitPhaseDuration,
			revealPhaseDuration: data.Lobby.revealPhaseDuration,
			time: zeroAddress,
			tokens: GameToken.address,
			placementCost: parseEther('1'),
			actionsPerReveal: data.Lobby.actionsPerReveal,
			cyclePolicy: data.Lobby.cyclePolicy,
		};

		// What the client budgets with, as for the world (see 010_deploy_game.ts).
		const clientGas = {
			commitGas: data.Lobby.commitGas,
			revealGas: data.Lobby.revealGas,
			expectedActionsPerTurn: data.Lobby.expectedActionsPerTurn,
		};

		const implementation = await deployViaRouter<Abi_IGameLobby>(
			'GameLobbyImplementation',
			{account: deployer},
			[
				{name: 'Getters', artifact: artifacts.GameGetters, args: [config]},
				{name: 'Commit', artifact: artifacts.GameCommit, args: [config]},
				{name: 'Reveal', artifact: artifacts.GameReveal, args: [config]},
				{
					name: 'Simulation',
					artifact: artifacts.GameSimulation,
					args: [config],
				},
				{name: 'Delegation', artifact: artifacts.GameDelegation, args: []},
				// The base's own lobby route, the same for every game: it takes
				// only the cycle's half of the config.
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
			// The router and every route. Deterministic (CREATE2), like every
			// contract here: see "Deterministic deployments" in README.md.
			// A route identical to the world's (Delegation) lands at the address
			// the world's already has, and is shared: a route holds no state.
			{deterministic: true},
		);

		await deploy<Abi_CommitRevealGameFactory>(
			'GameFactory',
			{
				account: deployer,
				artifact: artifacts.CommitRevealGameFactory,
				args: [implementation.address],
			},
			{
				// Every table's rules, where a client finds them: a table is
				// composed at run time from its address and THIS record, as the
				// world is from `Game`'s.
				linkedData: {...config, ...clientGas},
				deterministic: true,
			},
		);
	},
	{
		tags: ['Lobby', 'Lobby_deploy'],
		dependencies: ['GameToken_deploy'],
	},
);

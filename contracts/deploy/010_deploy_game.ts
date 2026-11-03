import {Abi_GameToken} from '../generated/abis/GameToken.js';
import {Abi_IGame} from '../generated/abis/IGame.js';
import {deployScript, artifacts} from '../rocketh/deploy.js';
import {parseEther, zeroAddress} from 'viem';

export default deployScript(
	async ({get, deployViaProxy, deployViaRouter, namedAccounts, data}) => {
		const {deployer, admin} = namedAccounts;

		const GameToken = get<Abi_GameToken>('GameToken');

		const config = {
			startTime: 0n,
			commitPhaseDuration: data.Game.commitPhaseDuration,
			revealPhaseDuration: data.Game.revealPhaseDuration,
			time: zeroAddress,
			tokens: GameToken.address,
			placementCost: parseEther('1'),
			// THE CHUNK: how many actions one reveal transaction may carry. Recorded
			// in `linkedData` below like everything else the client has to agree with
			// the contract about, and this one is not optional: a client that split a
			// turn into pieces of a different size would have every reveal past the
			// first revert, after the stake was already bonded.
			actionsPerReveal: data.Game.actionsPerReveal,
			// How the cycle advances, said out loud rather than derived from the
			// phase durations being zero. It is recorded in `linkedData` below,
			// which is where the client reads it: a client that had to infer the
			// policy from the durations would be reconstructing a decision the
			// deploy already made.
			cyclePolicy: data.Game.cyclePolicy,
		};

		/**
		 * What the CLIENT has to budget with, which the contract never reads.
		 *
		 * Recorded alongside the config rather than inside it: these are gas
		 * figures measured against THIS deployment's contracts, and the contract
		 * has no use for them, so putting them in the `Config` struct would spend
		 * deploy gas and a storage slot on a number only the front end reads.
		 *
		 * They are here rather than in the client because contracts are not
		 * inherited in this template tree and the client's files are: a descendant
		 * writes its own game and would otherwise inherit gas measured against a
		 * game it does not run. See `rocketh/config.ts` for the measurements and
		 * `test/js/GasBudget.test.ts` for what stops them rotting.
		 */
		const clientGas = {
			commitGas: data.Game.commitGas,
			revealGas: data.Game.revealGas,
			// AN EXPECTATION, NOT A BOUND, and the contract could not enforce it if
			// it wanted to: it is how many actions a turn is expected to carry, which
			// is what lets the client size anything in TURNS. `revealGas` bounds one
			// transaction; nothing bounds a turn wherever an action is free.
			expectedActionsPerTurn: data.Game.expectedActionsPerTurn,
		};

		const routes = [
			{name: 'Getters', artifact: artifacts.GameGetters, args: [config]},
			{name: 'Commit', artifact: artifacts.GameCommit, args: [config]},
			{name: 'Reveal', artifact: artifacts.GameReveal, args: [config]},
			// The game's rule, runnable without a chain: the client reads THIS
			// route's code and runs it in its own sandbox to preview a turn
			// (`web/src/lib/game/simulation/`). Its own route so that the code a
			// client fetches holds the rule and nothing that needs storage.
			{name: 'Simulation', artifact: artifacts.GameSimulation, args: [config]},
			// Who may play as whom. Its own route because a router maps one
			// selector to one route, and UsingDelegation carries six. Takes no
			// config: the delegation record is namespaced storage shared across
			// every route behind the proxy, and this contract holds nothing.
			{name: 'Delegation', artifact: artifacts.GameDelegation, args: []},
		];

		await deployViaProxy<Abi_IGame>(
			'Game',
			{
				account: deployer,
				artifact: (name, params) =>
					deployViaRouter<Abi_IGame>(name, params, routes),
				args: [config],
			},
			{
				owner: admin,
				// The struct the contract was constructed with, PLUS what only the
				// client needs. `linkedData` is the deployment record's, not the
				// contract's, so it may say more than the constructor took.
				linkedData: {...config, ...clientGas},
			},
		);
	},
	{tags: ['Game', 'Game_deploy'], dependencies: ['GameToken_deploy']},
);

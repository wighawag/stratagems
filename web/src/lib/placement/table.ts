/**
 * THE REFERENCE GAME'S TABLES: where its factory is, and what a table's
 * deployment record is (`$lib/game/lobby/table`'s `TableLobby`).
 *
 * A table is the world's record with the game at the table's address: the ABI
 * of the lobby implementation it is a clone of (the world's routes plus
 * the base's `CommitRevealLobby`), and the config every table plays by, which
 * `contracts/deploy/030_deploy_lobby.ts` records on the factory. The simulation
 * route the preview runs is the lobby implementation's, built with that config.
 * Everything else (the token, the sale) is the world's.
 */
import type {TypedDeployments} from '$lib/deployments-store';
import type {TableLobby} from '$lib/game/lobby/table';

export const placementLobby: TableLobby = {
	factory: (deployments) => deployments.contracts.GameFactory,
	deploymentsAt(deployments, table) {
		const {contracts} = deployments;
		return {
			...deployments,
			contracts: {
				...contracts,
				Game: {
					...contracts.GameLobbyImplementation,
					address: table,
					linkedData: contracts.GameFactory.linkedData,
				},
				Game_Implementation_Router_Simulation_Route:
					contracts.GameLobbyImplementation_Router_Simulation_Route,
			},
		} as unknown as TypedDeployments;
	},
};

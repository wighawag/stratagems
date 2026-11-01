import {describe, it, expect} from 'vitest';
import {placementLobby} from '$lib/placement/table';

/**
 * THE REFERENCE GAME'S TABLES: the deployment record a table is composed with.
 * Here rather than beside the framework's tests (`test/lib/game/lobby/`)
 * because it is this game's answer, which a game built from this template
 * deletes with the rest of `placement`.
 */

const TABLE = '0x1111111111111111111111111111111111111111' as const;

describe("the reference game's table record", () => {
	it('is the world record with the game at the table, as a clone of the lobby implementation', () => {
		const world = {
			chain: {id: 1},
			contracts: {
				Game: {address: '0xworld', abi: ['world'], linkedData: {world: true}},
				GameLobbyImplementation: {
					address: '0ximplementation',
					abi: ['lobby'],
				},
				GameFactory: {address: '0xfactory', linkedData: {lobby: true}},
				Game_Implementation_Router_Simulation_Route: {address: '0xworldsim'},
				GameLobbyImplementation_Router_Simulation_Route: {
					address: '0xlobbysim',
				},
				Token: {address: '0xtoken'},
			},
		};
		const record = placementLobby.deploymentsAt(
			world as never,
			TABLE,
		) as never as typeof world & {
			contracts: {Game: {address: string; abi: string[]; linkedData: unknown}};
		};
		expect(record.contracts.Game).toEqual({
			address: TABLE,
			abi: ['lobby'],
			linkedData: {lobby: true},
		});
		expect(
			record.contracts.Game_Implementation_Router_Simulation_Route,
		).toEqual({
			address: '0xlobbysim',
		});
		// Everything else is the world's.
		expect(record.contracts.Token).toBe(world.contracts.Token);
		expect(placementLobby.factory(world as never)).toBe(
			world.contracts.GameFactory,
		);
	});
});

import {describe, it, expect} from 'vitest';
import {stakeEverySeat, resolvePlayedSeats} from '$lib/game/offline';
import {tableOf, type Table} from '$lib/game/lobby/seats';

/**
 * THE TABLE WALK AN OFFLINE WORLD STAKES WITH, and the played seats it resolves
 * (K2b): who is in each seat, by the address that stakes for them and by the
 * SEAT INDEX, which is what a game whose identity depends on the seat (its
 * character, bomber-world's) needs from the walk. Node only: the stake and the
 * identity are the game's, so they are fakes here and the world tests
 * (`embedded/world.test.ts`, `offline-players.test.ts`) run the real ones.
 */

const YOU = '0x00000000000000000000000000000000000000A1' as const;
const SECOND = '0x00000000000000000000000000000000000000A2' as const;

describe('stakeEverySeat', () => {
	it('stakes for every seat the world provisions, in seat order, by address and seat index', async () => {
		const table = tableOf(4, 2);
		const staked: {player: string; seat: number; kind: string}[] = [];
		await stakeEverySeat({
			table,
			you: YOU,
			humans: [YOU, SECOND],
			stake: async ({player, seat, occupant}) => {
				staked.push({player, seat, kind: occupant.kind});
			},
		});
		const world = table.flatMap((seat) =>
			seat.occupant.kind === 'the-world' ? [seat.occupant.address] : [],
		);
		expect(staked).toEqual([
			{player: YOU, seat: 0, kind: 'you'},
			{player: SECOND, seat: 1, kind: 'local-human'},
			{player: world[0], seat: 2, kind: 'the-world'},
			{player: world[1], seat: 3, kind: 'the-world'},
		]);
	});

	it('skips a remote human, who stakes for themselves, and keeps the others at their seats', async () => {
		const [you, , played] = tableOf(3);
		const table: Table = [
			you,
			{occupant: {kind: 'remote-human', player: 7n}},
			played,
		];
		const seats: number[] = [];
		await stakeEverySeat({
			table,
			you: YOU,
			stake: async ({seat}) => {
				seats.push(seat);
			},
		});
		expect(seats).toEqual([0, 2]);
	});

	it('refuses a person at this device with no account, before staking anybody after them', async () => {
		const table = tableOf(4, 2);
		const staked: number[] = [];
		await expect(
			stakeEverySeat({
				table,
				you: YOU,
				humans: [YOU],
				stake: async ({seat}) => {
					staked.push(seat);
				},
			}),
		).rejects.toThrow('a person at this device has no account to stake for');
		expect(staked).toEqual([0]);
	});
});

describe('resolvePlayedSeats', () => {
	it('gives each world seat its key, the identity the game says for its seat, and its level', async () => {
		const table = tableOf(4, 1, ['random', 'greedy', 'random']);
		const asked: {player: string; seat: number}[] = [];
		const played = await resolvePlayedSeats({
			table,
			identityOf: async ({player, seat}) => {
				asked.push({player, seat});
				return BigInt(seat) * 1000n;
			},
		});
		const world = table.flatMap((seat) =>
			seat.occupant.kind === 'the-world' ? [seat.occupant] : [],
		);
		expect(asked).toEqual(
			world.map((occupant, index) => ({
				player: occupant.address,
				seat: index + 1,
			})),
		);
		expect(played).toEqual([
			{privateKey: world[0].privateKey, identity: 1000n},
			{privateKey: world[1].privateKey, identity: 2000n, level: 'greedy'},
			{privateKey: world[2].privateKey, identity: 3000n},
		]);
	});

	it('takes an identity the game knows without asking the chain', async () => {
		const played = await resolvePlayedSeats({
			table: tableOf(3),
			identityOf: ({player}) => BigInt(player),
		});
		expect(played.map((seat) => seat.identity)).toHaveLength(2);
		expect(typeof played[0].identity).toBe('bigint');
	});
});

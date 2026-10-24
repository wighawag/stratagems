import {describe, it, expect} from 'vitest';
import {
	FEWEST_SEATS,
	MOST_SEATS,
	SEATS_BY_DEFAULT,
	SEAT_CHOICES,
	clampSeats,
	seatsPlayedByTheWorld,
	tableOf,
} from '$lib/game/lobby/seats';

/**
 * THE SEAT MODEL, which is the part of the lobby that has to outlive the
 * lobby.
 *
 * Everything here is pure, so it is tested by stating a number and reading a
 * table. What it cannot test is the interesting half - that a world provisions
 * the seats it was handed - because only a chain can answer that; see
 * `test/lib/embedded/world.test.ts`, which reads the count back off
 * `getAttendance` rather than off a table this code built.
 */
describe('the seats at a table', () => {
	it('seats YOU first and gives the world the rest', () => {
		const table = tableOf(4);
		expect(table.map((seat) => seat.occupant.kind)).toEqual([
			'you',
			'the-world',
			'the-world',
			'the-world',
		]);
	});

	it('gives every seat the world plays a key of its own', () => {
		// TWO PLAYERS DERIVING ONE KEY would be two members the contract counts
		// separately and one address that can act for both: the second commit
		// replaces the first, unanimity is never completed, and under the manual
		// policy the cycle simply never moves.
		const played = seatsPlayedByTheWorld(tableOf(MOST_SEATS));
		expect(played).toHaveLength(MOST_SEATS - 1);
		expect(new Set(played.map((p) => p.address)).size).toBe(played.length);
		expect(new Set(played.map((p) => p.privateKey)).size).toBe(played.length);
		for (const player of played) {
			expect(player.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
			expect(player.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
		}
	});

	it('plays the same addresses this world has always played', () => {
		// THESE ADDRESSES ARE A WIRE, in AGENTS.md's sense, and there is nothing
		// else in the tree that would notice them changing. A world that has
		// booted holds this game's stake AT THESE ADDRESSES, and the contract is
		// waiting for them; a build that derived different ones would restore
		// that world and find its members unreachable - every cycle waiting for
		// players nobody holds a key for, which under the manual policy is a
		// world that never moves again. The type checker sees a refactor.
		//
		// The first two are pinned because they are the ones a world built before
		// the lobby existed is already waiting for.
		expect(seatsPlayedByTheWorld(tableOf(3)).map((p) => p.address)).toEqual([
			'0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
			'0x90F79bf6EB2c4f870365E785982E1f101E93b906',
		]);
	});

	it('never lays a table below the floor or above the ceiling', () => {
		// A stored count from another build, or a console, or a control that got
		// away: the answer is a table this code can reason about, not a repair.
		expect(tableOf(1)).toHaveLength(FEWEST_SEATS);
		expect(tableOf(0)).toHaveLength(FEWEST_SEATS);
		expect(tableOf(-4)).toHaveLength(FEWEST_SEATS);
		expect(tableOf(MOST_SEATS + 10)).toHaveLength(MOST_SEATS);
		expect(clampSeats(Number.NaN)).toBe(SEATS_BY_DEFAULT);
		expect(clampSeats('5')).toBe(5);
		expect(clampSeats('nonsense')).toBe(SEATS_BY_DEFAULT);
		expect(clampSeats(4.7)).toBe(4);
	});

	it('starts at three, because one hides nothing and two is a duel', () => {
		// The floor is the argument rather than a taste: one waited-for member
		// satisfies unanimity by existing, so the commit phase hides nothing and
		// two of `advanceCycle`'s three conditions cannot be reached; two is a
		// duel, where "everyone" and "the other one" are the same statement.
		expect(FEWEST_SEATS).toBe(3);
		expect(SEATS_BY_DEFAULT).toBe(FEWEST_SEATS);
	});

	it('offers every count between the floor and the ceiling, and nothing else', () => {
		expect(SEAT_CHOICES[0]).toBe(FEWEST_SEATS);
		expect(SEAT_CHOICES[SEAT_CHOICES.length - 1]).toBe(MOST_SEATS);
		expect(SEAT_CHOICES).toEqual([...SEAT_CHOICES].sort((a, b) => a - b));
		for (const choice of SEAT_CHOICES) expect(clampSeats(choice)).toBe(choice);
	});
});

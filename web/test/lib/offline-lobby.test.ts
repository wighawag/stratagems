import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {get} from 'svelte/store';

/**
 * THE WIRING BETWEEN THE FRAMEWORK'S LOBBY AND THIS WORLD.
 *
 * WHAT IS LEFT TO ASSERT HERE IS THE TWO ENDS, and that is the whole file. How a
 * lobby behaves - when it asks, when it must not ask again, what it remembers
 * before a boot - is `$lib/game/lobby/lobby`'s and is asserted against fake
 * deps in `test/lib/game/lobby/lobby.test.ts`, with nothing mocked. What is
 * THIS world's is which world gets started and which key says one is already
 * here, and both of those are things a mock can get wrong while every test
 * passes, which is why the last one below reads the real module.
 *
 * `$lib/offline` is mocked, and that is the point rather than a convenience: a
 * real boot would take a chain, a deploy and a browser to say the same thing.
 * The world's own half is asserted for real in `test/lib/embedded/world.test.ts`,
 * against a chain.
 */
const started: {table: {occupant: {kind: string}}[]}[] = [];

vi.mock('$lib/offline', () => ({
	CHAIN_ID_STORAGE_KEY: 'offline-world:chain-id',
	startOfflineWorld: (params: {table: {occupant: {kind: string}}[]}) => {
		started.push(params);
		return Promise.resolve({step: 'Booting', what: 'in a test'});
	},
}));

const store = new Map<string, string>();
let reloads = 0;

beforeEach(async () => {
	started.length = 0;
	reloads = 0;
	store.clear();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
	});
	vi.stubGlobal('location', {reload: () => void reloads++});
	vi.resetModules();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

async function lobby() {
	return (await import('$lib/offline-lobby')).offlineLobby;
}

describe('the offline world\u2019s lobby', () => {
	it('starts THIS world, with the table the player took', async () => {
		const offlineLobby = await lobby();
		offlineLobby.chooseSeats(5);
		offlineLobby.sitDown(get(offlineLobby).seats);

		expect(started).toHaveLength(1);
		expect(started[0].table).toHaveLength(5);
		expect(started[0].table.map((seat) => seat.occupant.kind)).toEqual([
			'you',
			'the-world',
			'the-world',
			'the-world',
			'the-world',
		]);
	});

	it('reads the chain id to know a world is already here, and its seats beside it', async () => {
		// BOTH KEYS ARE THIS FILE'S, in one namespace, and this is what the lobby
		// is handed instead of knowing: the chain id because the world writes it,
		// the seat count because the world cannot be counted before it boots.
		store.set('offline-world:chain-id', '9007199254740123');
		store.set('offline-world:seats', '4');

		const offlineLobby = await lobby();
		offlineLobby.enter();

		expect(get(offlineLobby)).toMatchObject({step: 'Sat', seats: 4});
		expect(started[0].table).toHaveLength(4);
	});

	it('forgets the chain id when the player leaves, which is what makes it a NEW world', async () => {
		// Everything a player keeps is keyed by the chain id, so forgetting it is
		// the whole mechanism: the next boot mints one and builds beside the old
		// world rather than into it. Leaving the id behind would restore the old
		// membership under a new count, silently.
		store.set('offline-world:chain-id', '9007199254740123');
		store.set('offline-world:seats', '4');

		const offlineLobby = await lobby();
		offlineLobby.leaveTheTable();

		expect(store.has('offline-world:chain-id')).toBe(false);
		expect(store.has('offline-world:seats')).toBe(false);
		expect(reloads).toBe(1);
	});

	// A COLD IMPORT OF THE WHOLE OFFLINE WORLD (a chain, the deploy scripts, the
	// app context), about three seconds alone and the one thing here that is not
	// mocked. Vitest's default five seconds made it fail intermittently once the
	// suite ran beside heavier files: measured in bomber-world, 2 of 3 full runs,
	// while it passed every time on its own.
	it(
		'forgets the key the world actually writes',
		{timeout: 30_000},
		async () => {
			// Guards the guard. Every assertion above is written against the mock's
			// copy of the key, so a rename in `$lib/offline` would leave them green
			// while this file cleared a key nothing uses - and "leave this table" would
			// quietly go back into the same world.
			vi.doUnmock('$lib/offline');
			vi.resetModules();
			const real = await import('$lib/offline');
			expect(real.CHAIN_ID_STORAGE_KEY).toBe('offline-world:chain-id');
		},
	);
});

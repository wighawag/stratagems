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
/** What the mocked boot resolves to; a test may hand back a world. */
let booted: unknown = {step: 'Booting', what: 'in a test'};

vi.mock('$lib/offline', () => ({
	CHAIN_ID_STORAGE_KEY: 'offline-world:chain-id',
	startOfflineWorld: (params: {table: {occupant: {kind: string}}[]}) => {
		started.push(params);
		return Promise.resolve(booted);
	},
}));

const store = new Map<string, string>();
let reloads = 0;

/**
 * The module each test imported, so its claim can be released after it. The
 * lock is Node's own and process-wide, the way a browser's is origin-wide, so a
 * claim one test left held would refuse the next test's lobby.
 */
let imported: typeof import('$lib/offline-lobby') | undefined;
const releases: (() => Promise<void>)[] = [];

beforeEach(async () => {
	started.length = 0;
	booted = {step: 'Booting', what: 'in a test'};
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

afterEach(async () => {
	await imported?.offlineWorldClaim.release();
	imported = undefined;
	await Promise.all(releases.splice(0).map((release) => release()));
	vi.unstubAllGlobals();
});

async function lobby() {
	imported = await import('$lib/offline-lobby');
	return imported.offlineLobby;
}

/**
 * The key the (mocked) world says it is remembered under, read rather than
 * spelled, so these cases hold unchanged in a game that versions the key.
 */
async function chainIdKey(): Promise<string> {
	return (await import('$lib/offline')).CHAIN_ID_STORAGE_KEY;
}

/**
 * Another tab holding the world: a claim of the same name, from the module the
 * lobby itself uses, whose reload releases the lock as closing a document does.
 */
async function anotherTabHolds(letGo: () => Promise<void> = async () => {}) {
	const {createWorldClaim} = await import('$lib/embedded/claim');
	let reloaded = 0;
	const other = createWorldClaim({
		name: 'offline-world',
		letGo,
		reload: () => {
			reloaded++;
			void other.release();
		},
	});
	expect(await other.claim()).toBe(true);
	releases.push(() => other.release());
	return {other, reloaded: () => reloaded};
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
		await offlineLobby.enter();

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

	it('never starts a world, nor offers a table, while another tab has the world', async () => {
		// The second tab of a browser that already holds a world. Booting would
		// restore the same chain beside the first tab's and the two would diverge;
		// offering the chooser would let it write a seat count over the world it
		// cannot play. So it is refused before the lobby looks.
		store.set(await chainIdKey(), '9007199254740123');
		store.set('offline-world:seats', '4');
		await anotherTabHolds();

		const offlineLobby = await lobby();
		await offlineLobby.enter();

		expect(started).toHaveLength(0);
		expect(get(offlineLobby).step).toBe('Opening');
		expect(get(imported!.offlineWorldClaim).step).toBe('Refused');
		expect(store.get('offline-world:seats')).toBe('4');
	});

	it('takes the world over, then boots it by the ordinary restore', async () => {
		store.set(await chainIdKey(), '9007199254740123');
		store.set('offline-world:seats', '4');
		const {reloaded} = await anotherTabHolds();

		const offlineLobby = await lobby();
		await offlineLobby.enter();
		expect(started).toHaveLength(0);

		await imported!.takeTheWorldOver();

		expect(reloaded()).toBe(1);
		expect(get(imported!.offlineWorldClaim).step).toBe('Held');
		expect(get(offlineLobby)).toMatchObject({step: 'Sat', seats: 4});
		expect(started).toHaveLength(1);
		expect(started[0].table).toHaveLength(4);
	});

	it('lets its world go when another tab asks: its boot awaited, the node disposed, one more request, then a reload', async () => {
		const calls: string[] = [];
		booted = {
			step: 'Ready',
			world: {
				dispose: async () => void calls.push('dispose'),
				provider: {
					request: async (args: {method: string}) => {
						calls.push(args.method);
						return '0x1';
					},
				},
			},
		};
		store.set(await chainIdKey(), '9007199254740123');
		store.set('offline-world:seats', '4');
		vi.stubGlobal('location', {
			reload: () => {
				reloads++;
				calls.push('reload');
				void imported?.offlineWorldClaim.release();
			},
		});

		const offlineLobby = await lobby();
		await offlineLobby.enter();
		expect(started).toHaveLength(1);

		const {createWorldClaim} = await import('$lib/embedded/claim');
		const asking = createWorldClaim({
			name: 'offline-world',
			letGo: async () => {},
		});
		releases.push(() => asking.release());
		await asking.takeOver();

		expect(calls).toEqual(['dispose', 'eth_blockNumber', 'reload']);
		expect(get(asking).step).toBe('Held');
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

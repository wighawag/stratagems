import {describe, it, expect, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import {
	clampOptionValue,
	clampTableCycles,
	defaultOptionValues,
	encodeTableOptions,
	createTableStore,
	DEFAULT_TABLE_CYCLES,
	describeDuration,
	describeTableProgress,
	FEWEST_TABLE_CYCLES,
	isMember,
	MOST_TABLE_CYCLES,
	NO_GAME_OPTIONS,
	memberLabel,
	readTables,
	tableAllowsPlay,
	tableFromParam,
	tableScreenOf,
	tableProgressOf,
	tableSettingsOf,
	type Roster,
	type TableOptions,
	type TableState,
} from '$lib/game/lobby/table';
import {tableAtRoster} from '$lib/game/lobby/seats';

/**
 * TABLES, the client half: which table a page is at, how a roster is laid out
 * as seats, and what the store says this account may do there.
 *
 * The rules of a seat (who may take one, when the creator may start, whom they
 * may forfeit) are the contract's and are tested there
 * (`contracts/test/js/CommitRevealRoster.test.ts`, `Lobby.test.ts`); what is
 * tested here is only that the client reads them back faithfully, since a
 * mismatch would show a Start button the contract then refuses, or hide one it
 * would accept.
 */

const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
const BOB = '0x0000000000000000000000000000000000000b0b' as const;
const TABLE = '0x1111111111111111111111111111111111111111' as const;

/** A roster not started yet, with whatever a test says on top. */
function rosterOf(overrides: Partial<Roster> = {}): Roster {
	return {
		creator: ALICE,
		seats: 3,
		started: false,
		cycles: 10,
		startedWith: 0,
		members: [],
		cycleNumber: 5n,
		lastCycleNumber: 0n,
		ended: false,
		gameOptions: NO_GAME_OPTIONS,
		...overrides,
	};
}

/** A reader answering the lobby's three views from one roster. */
function lobbyReader(rosterAt: (address: string) => Roster) {
	return vi.fn(
		async (request: {
			address: string;
			functionName: string;
			args?: readonly unknown[];
		}): Promise<unknown> => {
			const roster = rosterAt(request.address);
			if (request.functionName === 'getRoster') {
				return [
					{
						creator: roster.creator,
						seats: roster.seats,
						started: roster.started,
						cycles: roster.cycles,
						startedWith: roster.startedWith,
					},
					roster.members,
				];
			}
			if (request.functionName === 'getEnd') {
				return [roster.cycleNumber, roster.lastCycleNumber, roster.ended];
			}
			if (request.functionName === 'getGameOptions') {
				return roster.gameOptions;
			}
			throw new Error(`unexpected ${request.functionName}`);
		},
	);
}

describe('the table a page is at', () => {
	it('is the address `?game=` names', () => {
		expect(tableFromParam(TABLE)).toBe(TABLE);
	});

	it('is no table when the parameter is absent or not an address', () => {
		// A typo in a link must land on the world, not on a context composed
		// for a contract that is not there.
		expect(tableFromParam(undefined)).toBeUndefined();
		expect(tableFromParam('')).toBeUndefined();
		expect(tableFromParam('0x1234')).toBeUndefined();
		expect(tableFromParam(['0x', TABLE])).toBeUndefined();
	});
});

describe('a roster laid out as seats', () => {
	it('names this identity YOU, every other member a remote human, the rest empty', () => {
		const seats = tableAtRoster(4, [BigInt(BOB), BigInt(ALICE)], BigInt(ALICE));
		expect(seats.map((seat) => seat.occupant?.kind)).toEqual([
			'remote-human',
			'you',
			undefined,
			undefined,
		]);
		expect(seats[0].occupant).toEqual({
			kind: 'remote-human',
			player: BigInt(BOB),
		});
	});

	it('compares identities as numbers, so a token identity is you too', () => {
		// Where a game plays as a token, a member is the token: the account that
		// owns it is nowhere in the roster.
		const token = 7n;
		const seats = tableAtRoster(2, [token], token);
		expect(seats[0].occupant).toEqual({kind: 'you'});
	});

	it('shows every member as a remote human to a visitor with no identity', () => {
		const seats = tableAtRoster(2, [BigInt(ALICE)], undefined);
		expect(seats[0].occupant?.kind).toBe('remote-human');
		expect(seats[1].occupant).toBeUndefined();
	});

	it('is a member check that agrees with the layout', () => {
		const roster = rosterOf({members: [BigInt(ALICE)]});
		expect(isMember(roster, BigInt(ALICE))).toBe(true);
		expect(isMember(roster, BigInt(BOB))).toBe(false);
		expect(isMember(roster, undefined)).toBe(false);
	});

	it('names a member by its address when it is one, by its number when it is a token', () => {
		expect(memberLabel(BigInt(BOB))).toBe('0x0000...0b0b');
		expect(memberLabel(1n << 200n)).toBe(`#${1n << 200n}`);
	});
});

describe('the tables a factory lists', () => {
	it('reads the most recent ones, newest first, each with its roster', async () => {
		const games = [
			'0x0000000000000000000000000000000000000001',
			'0x0000000000000000000000000000000000000002',
			'0x0000000000000000000000000000000000000003',
		] as const;
		const lobby = lobbyReader((address) =>
			rosterOf({
				seats: 2,
				started: address === games[0],
				members: [BigInt(ALICE)],
			}),
		);
		const readContract = vi.fn(
			async (request: {
				address: string;
				functionName: string;
				args?: readonly unknown[];
			}) => {
				if (request.functionName === 'numGames') return 3n;
				if (request.functionName === 'getGames') {
					const [start, limit] = request.args as [bigint, bigint];
					return games.slice(Number(start), Number(start + limit));
				}
				return lobby(request);
			},
		);
		const tables = await readTables({readContract} as never, TABLE, {
			limit: 2,
		});
		// The two most recent, so the window starts at the second game.
		expect(tables.map((table) => table.address)).toEqual([games[2], games[1]]);
		expect(tables[0]).toMatchObject({
			creator: ALICE,
			seats: 2,
			started: false,
			cycles: 10,
		});
	});
});

describe('a table store', () => {
	function storeWith(roster: Roster, account: `0x${string}` | undefined) {
		const accountStore = writable(account);
		// A game that plays as the account: the identity follows it.
		const you = writable(account === undefined ? undefined : BigInt(account));
		const readContract = lobbyReader(() => roster);
		const table = createTableStore({
			deps: {
				publicClient: {readContract},
				account: accountStore,
			} as never,
			table: TABLE,
			you,
		});
		return {table, accountStore, you};
	}

	it('tells the creator they start it, and a seated guest that they are seated', async () => {
		const roster = rosterOf({members: [BigInt(ALICE), BigInt(BOB)]});
		const {table, accountStore, you} = storeWith(roster, ALICE);
		await table.update();
		let state = get(table);
		if (state.step !== 'Loaded') throw new Error(state.step);
		expect(state.isCreator).toBe(true);
		expect(state.seated).toBe(true);

		// The creator's powers follow the ACCOUNT, so they move with it, read
		// again without another round trip to the chain.
		const stop = table.startPolling();
		accountStore.set(BOB.toUpperCase().replace('0X', '0x') as `0x${string}`);
		you.set(BigInt(BOB));
		state = get(table);
		stop();
		if (state.step !== 'Loaded') throw new Error(state.step);
		expect(state.isCreator).toBe(false);
		expect(state.seated).toBe(true);
	});

	it('fails visibly when the address is not a table', async () => {
		const table = createTableStore({
			deps: {
				publicClient: {
					readContract: async () => {
						throw new Error('execution reverted');
					},
				},
				account: writable(undefined),
			} as never,
			table: TABLE,
			you: writable(undefined),
		});
		await table.update();
		expect(get(table)).toEqual({step: 'Failed', message: 'execution reverted'});
	});
});

describe('a table before its start', () => {
	const loaded = (overrides: {
		started?: boolean;
		ended?: boolean;
		members?: bigint[];
		seats?: number;
		isCreator?: boolean;
		seated?: boolean;
	}): TableState => {
		const members = overrides.members ?? [BigInt(ALICE)];
		const roster = rosterOf({
			seats: overrides.seats ?? 3,
			started: overrides.started ?? false,
			ended: overrides.ended ?? false,
			members,
		});
		return {
			step: 'Loaded',
			roster,
			table: [],
			isCreator: overrides.isCreator ?? false,
			seated: overrides.seated ?? false,
		};
	};

	it('takes no turn until the table has started, and then only from a member', () => {
		// The contract refuses a commitment before the start from anyone, and
		// after it from anyone not seated: a plan made then could only revert.
		expect(tableAllowsPlay(undefined)).toBe(true);
		expect(tableAllowsPlay({step: 'Loading'})).toBe(false);
		expect(tableAllowsPlay(loaded({seated: true}))).toBe(false);
		expect(tableAllowsPlay(loaded({started: true, seated: false}))).toBe(false);
		expect(tableAllowsPlay(loaded({started: true, seated: true}))).toBe(true);
		// After its last cycle the contract refuses every commitment.
		expect(
			tableAllowsPlay(loaded({started: true, seated: true, ended: true})),
		).toBe(false);
	});

	it('keeps the board for a member once it has ended, and tells anyone else it has', () => {
		expect(
			tableScreenOf(loaded({started: true, seated: true, ended: true})),
		).toEqual({screen: 'playing'});
		const closed = tableScreenOf(loaded({started: true, ended: true}));
		if (closed.screen !== 'closed') throw new Error(closed.screen);
		expect(closed.status).toMatch(/has ended/);
	});

	it('shows its lobby until it starts, the board to a member after, and a closed door to anyone else', () => {
		expect(tableScreenOf(loaded({})).screen).toBe('lobby');
		expect(tableScreenOf(loaded({started: true, seated: true}))).toEqual({
			screen: 'playing',
		});
		expect(tableScreenOf(loaded({started: true})).screen).toBe('closed');
	});

	it('tells each person what they are waiting for', () => {
		const status = (state: TableState) => {
			const screen = tableScreenOf(state);
			if (screen.screen !== 'lobby') throw new Error(screen.screen);
			return screen;
		};
		const visitor = status(loaded({}));
		expect(visitor.seatFree).toBe(true);
		expect(visitor.status).toMatch(/take a seat to join/i);

		const guest = status(
			loaded({members: [BigInt(ALICE), BigInt(BOB)], seated: true}),
		);
		expect(guest.canStart).toBe(false);
		expect(guest.status).toMatch(/waiting for the creator/i);

		const alone = status(loaded({isCreator: true, seated: true}));
		expect(alone.canStart).toBe(false);
		expect(alone.status).toMatch(/at least one more player/i);

		const ready = status(
			loaded({
				isCreator: true,
				seated: true,
				members: [BigInt(ALICE), BigInt(BOB)],
			}),
		);
		expect(ready.canStart).toBe(true);
		expect(ready.status).toMatch(/start now, or wait/i);

		const full = status(
			loaded({members: [BigInt(ALICE), BigInt(BOB)], seats: 2}),
		);
		expect(full.seatFree).toBe(false);
		expect(full.status).toMatch(/every seat is taken/i);
	});

	it('says what every table plays by, from the deployment', () => {
		expect(
			tableSettingsOf({
				commitPhaseDuration: 45,
				revealPhaseDuration: 15,
				startTime: 0,
				commitTimeAllowance: 5,
				policy: 'hybrid',
			}),
		).toEqual({
			commitPhaseDuration: 45,
			revealPhaseDuration: 15,
			earlyAdvance: true,
		});
		expect(describeDuration(45)).toBe('45 seconds');
		expect(describeDuration(180)).toBe('3 minutes');
		expect(describeDuration(86400)).toBe('24 hours');
	});
});

describe("a table's end", () => {
	it('counts the cycle it plays from one, out of how many, from the last cycle the start fixed', () => {
		expect(tableProgressOf(rosterOf())).toBeUndefined();
		const started = rosterOf({
			started: true,
			cycles: 3,
			lastCycleNumber: 12n,
		});
		expect(tableProgressOf({...started, cycleNumber: 10n})).toEqual({
			step: 'playing',
			cycle: 1,
			of: 3,
		});
		expect(tableProgressOf({...started, cycleNumber: 12n})).toEqual({
			step: 'playing',
			cycle: 3,
			of: 3,
		});
		const ended = tableProgressOf({...started, cycleNumber: 13n, ended: true});
		expect(ended).toEqual({step: 'ended', of: 3});
		expect(describeTableProgress({step: 'playing', cycle: 2, of: 3})).toBe(
			'Cycle 2 of 3',
		);
		expect(describeTableProgress({step: 'ended', of: 3})).toBe(
			'Ended after 3 cycles',
		);
	});

	it('offers a count of cycles inside its bounds, the default for anything unreadable', () => {
		expect(clampTableCycles(7)).toBe(7);
		expect(clampTableCycles(0)).toBe(FEWEST_TABLE_CYCLES);
		expect(clampTableCycles(1e6)).toBe(MOST_TABLE_CYCLES);
		expect(clampTableCycles(4.7)).toBe(4);
		expect(clampTableCycles('9')).toBe(DEFAULT_TABLE_CYCLES);
		expect(clampTableCycles(NaN)).toBe(DEFAULT_TABLE_CYCLES);
	});
});

describe("a game's options at a table", () => {
	const options: TableOptions = {
		fields: [
			{
				id: 'stake',
				label: 'Stake',
				min: 1,
				max: 100,
				default: 10,
				unit: 'gems',
			},
			{id: 'gap', label: 'Gap', min: 0, max: 200, default: 50, unit: '%'},
		],
		encode: (values) =>
			`0x${((BigInt(values.gap) << 32n) | BigInt(values.stake)).toString(16).padStart(64, '0')}`,
		describe: () => [],
	};

	it('starts every field at its default, and keeps a value inside its bounds', () => {
		expect(defaultOptionValues(options)).toEqual({stake: 10, gap: 50});
		expect(clampOptionValue(options.fields[0], 0)).toBe(1);
		expect(clampOptionValue(options.fields[0], 250)).toBe(100);
		expect(clampOptionValue(options.fields[1], 12.9)).toBe(12);
		expect(clampOptionValue(options.fields[1], undefined)).toBe(50);
	});

	it('encodes what the creator chose, each value clamped to its field first', () => {
		expect(encodeTableOptions(options, {stake: 7, gap: 1000})).toBe(
			`0x${((200n << 32n) | 7n).toString(16).padStart(64, '0')}`,
		);
	});
});

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {get} from 'svelte/store';
import {createLobby} from '$lib/game/lobby/lobby';
import type {Table} from '$lib/game/lobby/seats';

/**
 * THE LOBBY, WITHOUT A GAME BEHIND IT.
 *
 * NOTHING IS MOCKED HERE, and that is the dividend of the inversion rather than
 * a testing preference. This used to be asserted against a `vi.mock` of the
 * reference game's world builder, which meant the tests knew that module's name
 * and its two exports, and needed one extra test to guard the mock's copy of a
 * storage key against the real one. A lobby now takes the game as four
 * parameters, so the fakes below are the seam itself: if they are wrong, the
 * types say so.
 *
 * What is NOT here is the other half - that a game actually provisions the
 * seats it was handed. Only a chain can answer that; the offline world's own
 * suite does it against one (`test/lib/embedded/world.test.ts`, which reads the
 * count back off `getAttendance`). The wiring that connects the two is asserted
 * in `test/lib/offline-lobby.test.ts`.
 */
const store = new Map<string, string>();
let reloads = 0;

const SEATS_KEY = 'a-game:seats';
const HUMANS_KEY = 'a-game:humans';

beforeEach(() => {
	store.clear();
	reloads = 0;
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
	});
	vi.stubGlobal('location', {reload: () => void reloads++});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** A game that is here when it says it is, and remembers being forgotten. */
function fakeGame(params: {alreadyHere?: boolean} = {}) {
	const started: Table[] = [];
	let here = params.alreadyHere ?? false;
	const lobby = createLobby({
		gameAlreadyHere: () => here,
		startGame: (table) => void started.push(table),
		forgetGame: () => void (here = false),
		seatsStorageKey: SEATS_KEY,
	});
	return {
		lobby,
		started,
		isHere: () => here,
	};
}

describe('the lobby', () => {
	it('offers nothing until the browser has looked', () => {
		// PRERENDER. Whether there is a game here is a question only this browser
		// can answer, so the server cannot know which state is right - and a
		// chooser in prerendered HTML is a control on screen before any handler is
		// attached. Measured, not feared: a run that pressed eight seats got
		// three, silently, because the press landed before hydration and the mount
		// then reset the state.
		const {lobby} = fakeGame();
		expect(get(lobby).step).toBe('Opening');
	});

	it('asks how many seats when there is no game yet', () => {
		const {lobby, started} = fakeGame();
		lobby.enter();

		expect(get(lobby).step).toBe('Choosing');
		// NOTHING IS BOOTED BY ASKING. A lobby that started a game while the
		// player was still choosing would have provisioned the membership before
		// the choice, which is the one thing this whole design exists to prevent.
		expect(started).toHaveLength(0);
	});

	it('does not reset a choice when the route mounts again', () => {
		// The lobby is app-scoped, like the game it starts, so navigating away and
		// back mounts the route a second time. A pass that reset the state would
		// throw away a choice the player was in the middle of making.
		const {lobby, started} = fakeGame();
		lobby.enter();
		lobby.chooseSeats(5);
		lobby.enter();

		expect(get(lobby)).toMatchObject({step: 'Choosing', seats: 5});
		expect(started).toHaveLength(0);
	});

	it('starts the table it was told to, once the player sits down', () => {
		const {lobby, started} = fakeGame();
		lobby.chooseSeats(5);
		lobby.sitDown(get(lobby).seats);

		expect(get(lobby)).toMatchObject({step: 'Sat', seats: 5});
		expect(started).toHaveLength(1);
		expect(started[0].map((seat) => seat.occupant.kind)).toEqual([
			'you',
			'the-world',
			'the-world',
			'the-world',
			'the-world',
		]);
	});

	it('goes straight back into a game that is already here, at ITS count', () => {
		// A booted game keeps the membership it was provisioned with. Offering the
		// chooser again would be offering a choice that cannot be honoured, and
		// honouring it silently would mean a table of three on a chain that is
		// waiting for four.
		store.set(SEATS_KEY, '4');
		const {lobby, started} = fakeGame({alreadyHere: true});
		lobby.enter();

		expect(get(lobby)).toMatchObject({step: 'Sat', seats: 4});
		expect(started[0]).toHaveLength(4);
	});

	it('ignores a remembered count with no game behind it', () => {
		// Both or neither: a seat record alone is not a game to carry on with, and
		// acting on it would boot a brand new game at a count nobody was asked
		// about on this visit.
		store.set(SEATS_KEY, '4');
		const {lobby, started} = fakeGame({alreadyHere: false});
		lobby.enter();

		expect(get(lobby).step).toBe('Choosing');
		expect(started).toHaveLength(0);
	});

	it('remembers the table BEFORE the boot, so an interrupted one still counts', () => {
		const {lobby} = fakeGame();
		lobby.sitDown(4);
		expect(store.get(SEATS_KEY)).toBe('4');
	});

	it('asks the game to forget itself when the player leaves, and reloads', () => {
		// WHAT MAKES IT A NEW GAME IS THE GAME'S, which is why this asserts that it
		// was ASKED rather than what it did about it: in the offline world that is
		// forgetting a chain id, because everything the player keeps is keyed by
		// one, and a lobby that knew that would be back to knowing what a game is.
		store.set(SEATS_KEY, '4');
		const world = fakeGame({alreadyHere: true});
		world.lobby.leaveTheTable();

		expect(world.isHere()).toBe(false);
		expect(store.has(SEATS_KEY)).toBe(false);
		expect(reloads).toBe(1);
	});

	it('clamps a stored count that could not have been chosen', () => {
		// Storage is not trustworthy: a previous build, or a person with a console,
		// may have left anything there. Clamped rather than repaired into something
		// meaningful, and above all not acted on as written - a table of 40 would
		// ask the game to stake for 39 members it has no keys for.
		store.set(SEATS_KEY, '40');
		const {lobby, started} = fakeGame({alreadyHere: true});
		lobby.enter();

		expect(get(lobby).seats).toBe(10);
		expect(started[0]).toHaveLength(10);
	});
});

describe('the lobby, for a game that can seat several people at one device', () => {
	function hotseatGame(params: {alreadyHere?: boolean; atMost?: number} = {}) {
		const started: Table[] = [];
		const lobby = createLobby({
			gameAlreadyHere: () => params.alreadyHere ?? false,
			startGame: (table) => void started.push(table),
			forgetGame: () => {},
			seatsStorageKey: SEATS_KEY,
			humansStorageKey: HUMANS_KEY,
			humansAtMost: params.atMost ?? 10,
		});
		return {lobby, started};
	}

	it('offers no choice of people to a game that has no hotseat', () => {
		const {lobby} = fakeGame();
		lobby.enter();
		expect(get(lobby)).toMatchObject({humans: 1, humansAtMost: 1});
		expect(get(lobby).humanChoices).toEqual([1]);
		lobby.chooseHumans(3);
		expect(get(lobby).humans).toBe(1);
	});

	it('offers one person to every seat, up to what the game can play', () => {
		const {lobby} = hotseatGame({atMost: 2});
		lobby.enter();
		lobby.chooseSeats(4);
		expect(get(lobby).humanChoices).toEqual([1, 2]);
		lobby.chooseHumans(5);
		expect(get(lobby).humans).toBe(2);
	});

	it('remembers how many people beside the seats, and boots that table', () => {
		const {lobby, started} = hotseatGame();
		lobby.enter();
		lobby.chooseSeats(3);
		lobby.chooseHumans(2);
		lobby.sitDown(get(lobby).seats);
		expect(store.get(HUMANS_KEY)).toBe('2');
		expect(started[0].map((seat) => seat.occupant.kind)).toEqual([
			'you',
			'local-human',
			'the-world',
		]);
	});

	it('goes back into a world with its people, and reads a world from before hotseat as one person', () => {
		store.set(SEATS_KEY, '3');
		store.set(HUMANS_KEY, '2');
		const back = hotseatGame({alreadyHere: true});
		back.lobby.enter();
		expect(get(back.lobby)).toMatchObject({step: 'Sat', seats: 3, humans: 2});

		store.delete(HUMANS_KEY);
		const before = hotseatGame({alreadyHere: true});
		before.lobby.enter();
		expect(get(before.lobby)).toMatchObject({step: 'Sat', seats: 3, humans: 1});
	});

	it('forgets the people with the seats when the player leaves', () => {
		store.set(SEATS_KEY, '3');
		store.set(HUMANS_KEY, '2');
		const {lobby} = hotseatGame({alreadyHere: true});
		lobby.leaveTheTable();
		expect(store.has(HUMANS_KEY)).toBe(false);
	});
});

describe('the lobby with levels for the world seats', () => {
	const LEVELS_KEY = 'a-game:levels';
	const OFFERS = [
		{id: 'random', label: 'Random'},
		{id: 'greedy', label: 'Greedy'},
	];

	function levelledGame(
		params: {alreadyHere?: boolean; defaultLevel?: string} = {},
	) {
		const started: Table[] = [];
		let here = params.alreadyHere ?? false;
		const lobby = createLobby({
			gameAlreadyHere: () => here,
			startGame: (table) => void started.push(table),
			forgetGame: () => void (here = false),
			seatsStorageKey: SEATS_KEY,
			humansStorageKey: HUMANS_KEY,
			humansAtMost: 10,
			levelsStorageKey: LEVELS_KEY,
			levels: OFFERS,
			defaultLevel: params.defaultLevel,
		});
		return {lobby, started};
	}

	const worldLevels = (table: Table) =>
		table
			.filter((seat) => seat.occupant.kind === 'the-world')
			.map((seat) =>
				seat.occupant.kind === 'the-world' ? seat.occupant.level : undefined,
			);

	it('offers no choice of level to a game that offers none', () => {
		const {lobby} = fakeGame();
		lobby.enter();
		expect(get(lobby).levelChoices).toEqual([]);
		expect(get(lobby).levels).toEqual(['random', 'random']);
	});

	it('defaults every world seat to random, which is the world as it always was', () => {
		const {lobby, started} = levelledGame();
		lobby.enter();
		expect(get(lobby).levelChoices).toEqual(OFFERS);
		expect(get(lobby).levels).toEqual(['random', 'random']);
		lobby.sitDown();
		expect(worldLevels(started[0])).toEqual([undefined, undefined]);
		expect(store.get(LEVELS_KEY)).toBe('["random","random"]');
	});

	it('takes a level per world seat, keeps it as the seats change, and boots that table', () => {
		const {lobby, started} = levelledGame();
		lobby.enter();
		lobby.chooseLevel(1, 'greedy');
		expect(get(lobby).levels).toEqual(['random', 'greedy']);
		lobby.chooseSeats(4);
		expect(get(lobby).levels).toEqual(['random', 'greedy', 'random']);
		lobby.chooseHumans(3);
		// Three people at four seats leaves one world seat, which keeps the
		// first one's level.
		expect(get(lobby).levels).toEqual(['random']);
		lobby.chooseHumans(1);
		lobby.chooseLevel(0, 'greedy');
		lobby.chooseLevel(2, 'genius');
		lobby.chooseLevel(9, 'greedy');
		expect(get(lobby).levels).toEqual(['greedy', 'random', 'random']);
		lobby.sitDown(get(lobby).seats);
		expect(store.get(LEVELS_KEY)).toBe('["greedy","random","random"]');
		expect(worldLevels(started[0])).toEqual(['greedy', undefined, undefined]);
	});

	it('goes back into a world with its levels, and reads absent and unknown ones as random', () => {
		store.set(SEATS_KEY, '3');
		store.set(LEVELS_KEY, '["random","greedy"]');
		const back = levelledGame({alreadyHere: true});
		back.lobby.enter();
		expect(get(back.lobby)).toMatchObject({
			step: 'Sat',
			levels: ['random', 'greedy'],
		});
		expect(worldLevels(back.started[0])).toEqual([undefined, 'greedy']);

		store.delete(LEVELS_KEY);
		const before = levelledGame({alreadyHere: true});
		before.lobby.enter();
		expect(get(before.lobby).levels).toEqual(['random', 'random']);

		store.set(LEVELS_KEY, '["genius", 3');
		const garbled = levelledGame({alreadyHere: true});
		garbled.lobby.enter();
		expect(get(garbled.lobby).levels).toEqual(['random', 'random']);
	});

	it('starts a fresh choice at the game\u2019s default level, and pads a growing table with it', () => {
		const {lobby, started} = levelledGame({defaultLevel: 'greedy'});
		lobby.enter();
		expect(get(lobby).levels).toEqual(['greedy', 'greedy']);
		lobby.chooseLevel(0, 'random');
		lobby.chooseSeats(4);
		expect(get(lobby).levels).toEqual(['random', 'greedy', 'greedy']);
		lobby.sitDown(get(lobby).seats);
		expect(worldLevels(started[0])).toEqual([undefined, 'greedy', 'greedy']);
	});

	it('restores a world as it was built, whatever the default: absent is random', () => {
		store.set(SEATS_KEY, '3');
		const back = levelledGame({alreadyHere: true, defaultLevel: 'greedy'});
		back.lobby.enter();
		expect(get(back.lobby).levels).toEqual(['random', 'random']);
	});

	it('reads a default it does not offer as random', () => {
		const {lobby} = levelledGame({defaultLevel: 'genius'});
		lobby.enter();
		expect(get(lobby).levels).toEqual(['random', 'random']);
	});

	it('forgets the levels with the seats when the player leaves', () => {
		store.set(SEATS_KEY, '3');
		store.set(LEVELS_KEY, '["greedy","greedy"]');
		const {lobby} = levelledGame({alreadyHere: true});
		lobby.leaveTheTable();
		expect(store.has(LEVELS_KEY)).toBe(false);
	});
});

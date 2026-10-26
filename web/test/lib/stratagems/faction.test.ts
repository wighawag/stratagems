import {describe, expect, it} from 'vitest';
import {get, writable} from 'svelte/store';
import {
	createFaction,
	defaultColorOf,
	FACTIONS,
	factionStorageKey,
	loadFaction,
} from '$lib/stratagems/faction';
import {ALICE, BOB} from './board';

function memoryStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
	};
}

describe('the faction', () => {
	it("defaults to the legacy client's colour: the address modulo 5, plus one", () => {
		expect(defaultColorOf('0x0000000000000000000000000000000000000005')).toBe(
			1,
		);
		expect(defaultColorOf('0x0000000000000000000000000000000000000007')).toBe(
			3,
		);
		expect(loadFaction(ALICE, memoryStorage())).toBe(defaultColorOf(ALICE));
	});

	it('is stored per address, lower-case, under one key chosen once', () => {
		expect(
			factionStorageKey('0xAbCd000000000000000000000000000000000001'),
		).toBe('__stratagems_faction__0xabcd000000000000000000000000000000000001');
	});

	it('reads a stored pick, and ignores a record that is not a faction', () => {
		const storage = memoryStorage({
			[factionStorageKey(ALICE)]: '4',
			[factionStorageKey(BOB)]: '6', // Evil is not a faction
		});
		expect(loadFaction(ALICE, storage)).toBe(4);
		expect(loadFaction(BOB, storage)).toBe(defaultColorOf(BOB));
	});

	it('picks for the current player, persists it, and follows a change of player', () => {
		const storage = memoryStorage();
		const player = writable<`0x${string}` | undefined>(ALICE);
		const faction = createFaction({player, storage});
		const seen: (number | undefined)[] = [];
		const stop = faction.subscribe((value) => seen.push(value));
		faction.pick(5);
		expect(get(faction)).toBe(5);
		expect(storage.map.get(factionStorageKey(ALICE))).toBe('5');
		player.set(BOB);
		expect(get(faction)).toBe(defaultColorOf(BOB));
		player.set(undefined);
		expect(get(faction)).toBeUndefined();
		stop();
		expect(seen[0]).toBe(defaultColorOf(ALICE));
	});

	it('refuses a colour that is not a faction, and a pick with nobody playing', () => {
		const storage = memoryStorage();
		const player = writable<`0x${string}` | undefined>(undefined);
		const faction = createFaction({player, storage});
		faction.pick(2);
		expect(storage.map.size).toBe(0);
		player.set(ALICE);
		faction.pick(6);
		faction.pick(0);
		expect(get(faction)).toBe(defaultColorOf(ALICE));
		expect(FACTIONS.map((f) => f.color)).toEqual([1, 2, 3, 4, 5]);
	});

	it('holds a pick for the tab when the storage refuses it', () => {
		const player = writable<`0x${string}` | undefined>(ALICE);
		const faction = createFaction({
			player,
			storage: {
				getItem: () => null,
				setItem: () => {
					throw new Error('quota');
				},
			},
		});
		faction.pick(3);
		expect(get(faction)).toBe(3);
	});
});

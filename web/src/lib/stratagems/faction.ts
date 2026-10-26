/**
 * THE PLAYER'S FACTION: the colour their moves place (P5 of step 6c in
 * work/plans/join-template-commit-reveal.md).
 *
 * A local preference, not a commitment's wire: nothing on chain depends on how
 * it is stored, since a move carries its colour and the turn is hashed with it.
 * Kept per player address in `localStorage` under `__stratagems_faction__<address>`
 * (lower-case), the same across chains and deployments because a faction is the
 * player's choice, not a deployment's. Absent, the faction is the one the legacy
 * client gave every player by default: their address modulo 5, plus one.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import {Color} from 'stratagems-common';

/**
 * Every `Color`'s name and its hue as the legacy renderer drew it, indexed by
 * the colour: None, the five factions, Evil.
 */
export const COLOURS: readonly {name: string; hex: string}[] = [
	{name: 'None', hex: '#00000000'},
	{name: 'Blue', hex: '#5ab9bb'},
	{name: 'Red', hex: '#c5836e'},
	{name: 'Green', hex: '#8bffcb'},
	{name: 'Yellow', hex: '#d3d66d'},
	{name: 'Purple', hex: '#a9799d'},
	{name: 'Evil', hex: '#3d3d3d'},
];

/** The factions a player may pick, in `Color` order (Evil is not a faction). */
export const FACTIONS: readonly {color: number; name: string; hex: string}[] = [
	Color.Blue,
	Color.Red,
	Color.Green,
	Color.Yellow,
	Color.Purple,
].map((color) => ({color, ...COLOURS[color]}));

export const FACTION_STORAGE_PREFIX = '__stratagems_faction__';

/** The player's default faction (1 to 5), as the legacy client derived it. */
export function defaultColorOf(player: `0x${string}`): number {
	return Number((BigInt(player) % 5n) + 1n);
}

export function isFaction(color: unknown): color is number {
	return typeof color === 'number' && FACTIONS.some((faction) => faction.color === color);
}

export function factionStorageKey(player: `0x${string}`): string {
	return `${FACTION_STORAGE_PREFIX}${player.toLowerCase()}`;
}

/** The storage the store reads and writes: `localStorage`'s two methods. */
export type FactionStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): FactionStorage | undefined {
	try {
		return typeof localStorage === 'undefined' ? undefined : localStorage;
	} catch {
		// a sandboxed frame may refuse access outright
		return undefined;
	}
}

/** What `player` picked, or their default. An unreadable record is ignored. */
export function loadFaction(player: `0x${string}`, storage: FactionStorage | undefined = browserStorage()): number {
	const stored = storage?.getItem(factionStorageKey(player));
	if (stored) {
		const color = Number(stored);
		if (isFaction(color)) return color;
	}
	return defaultColorOf(player);
}

export type FactionStore = Readable<number | undefined> & {
	/** Pick a faction for the current player. Ignored without one. */
	pick(color: number): void;
};

export function createFaction(params: {
	player: Readable<`0x${string}` | undefined>;
	storage?: FactionStorage;
}): FactionStore {
	const storage = params.storage ?? browserStorage();
	// what was picked in this tab, so a pick holds even where storage refuses it
	const picked = writable<Record<string, number>>({});
	const value = derived([params.player, picked], ([$player, $picked]) => {
		if (!$player) return undefined;
		return $picked[$player.toLowerCase()] ?? loadFaction($player, storage);
	});
	return {
		subscribe: value.subscribe,
		pick(color) {
			const player = get(params.player);
			if (!player || !isFaction(color)) return;
			try {
				storage?.setItem(factionStorageKey(player), String(color));
			} catch {
				// a full or refused storage: the pick lasts as long as this tab
			}
			picked.update((all) => ({...all, [player.toLowerCase()]: color}));
		},
	};
}

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
	createSubmissionStorage,
	submissionStorageKey,
} from '$lib/placement/storage';

/**
 * THE WIRE, byte for byte. This game's records are a wire once it has players
 * (AGENTS.md, "Commit-reveal rules"), and the storage moved into the framework
 * (`$lib/game/core/commit-reveal/storage`) with this game's prefixes and codec
 * passed in. A record a previous build wrote must still load, so the key and
 * the JSON are pinned as that build wrote them.
 */
const store = new Map<string, string>();

beforeEach(() => {
	store.clear();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000aa' as const;

describe("the reference game's submission storage", () => {
	it("writes the reference game's records exactly as before the move", () => {
		const key = submissionStorageKey({
			chainID: 31337,
			gameAddress: '0xGame',
			// `as never`: an identity is an address here and a token id on
			// `with/nft-identity`, and the key is the same template either way.
			player: '0xPlayer' as never,
		});
		expect(key).toBe('__placement_submission__31337_0xgame_0xplayer');

		const storage = createSubmissionStorage({key});
		storage.save({
			cycleNumber: 3,
			actions: [{cellID: 12n}],
			secret: SECRET,
			committed: true,
		});
		const written = JSON.stringify({
			cycleNumber: 3,
			actions: ['12'],
			secret: SECRET,
			committed: true,
		});
		expect(store.get(key)).toBe(written);
		expect(store.get('__placement_committed_turn__31337_0xgame_0xplayer')).toBe(
			written,
		);
	});
});

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
	createSubmissionStorage,
	loadCommittedTurn,
	submissionStorageKey,
	type SubmissionStorageFormat,
} from '$lib/game/core/commit-reveal/storage';

/**
 * The submission storage, for a game whose action is not a placement.
 *
 * The record and its key are a WIRE (AGENTS.md, "Commit-reveal rules"), so the
 * format is the game's and the module must neither rename it nor reshape it.
 * Pinned here: a second game's records round-trip through its own codec under
 * its own prefixes. That the reference game's records are written exactly as
 * before is pinned beside the reference game, in `test/lib/placement/`.
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

type Move = {position: bigint; color: number};

const MOVES: SubmissionStorageFormat<Move> = {
	prefix: '__moves_submission__',
	committedPrefix: '__moves_committed_turn__',
	encode: (move) => [move.position.toString(), move.color],
	decode: (stored) => {
		const [position, color] = stored as [string, number];
		return {position: BigInt(position), color};
	},
};

const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000aa' as const;

describe('the submission storage', () => {
	it('round-trips a second action type through its own codec', () => {
		const key = submissionStorageKey({
			prefix: MOVES.prefix,
			chainID: 31337,
			gameAddress: '0xGAME',
			player: '0xABC',
		});
		const storage = createSubmissionStorage({key, format: MOVES});
		const actions = [
			{position: 2n ** 40n, color: 3},
			{position: 7n, color: 0},
		];
		storage.save({cycleNumber: 4, actions, secret: SECRET, committed: false});
		expect(storage.load()).toEqual({
			cycleNumber: 4,
			actions,
			secret: SECRET,
			committed: false,
		});
		// Nothing was copied aside: the turn was not committed.
		expect(loadCommittedTurn(MOVES, key)).toBeUndefined();
	});

	it('keeps a committed turn aside, under its own prefix, after a clear', () => {
		const key = submissionStorageKey({
			prefix: MOVES.prefix,
			chainID: 1,
			gameAddress: '0xgame',
			player: 5n,
		});
		const storage = createSubmissionStorage({key, format: MOVES});
		const actions = [{position: 1n, color: 1}];
		storage.save({cycleNumber: 9, actions, secret: SECRET, committed: true});
		storage.clear();

		expect(storage.load()).toBeUndefined();
		expect(loadCommittedTurn(MOVES, key)).toEqual({
			cycleNumber: 9,
			actions,
			secret: SECRET,
			committed: true,
		});
		expect([...store.keys()]).toEqual(['__moves_committed_turn__1_0xgame_5']);
	});
});

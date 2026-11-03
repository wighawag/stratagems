import {describe, it, expect} from 'vitest';
import {
	COMMITTED_TURNS_KEPT,
	createPlayedTurnStore,
	decidePlayedTurn,
	seededRandom,
	type PlayedTurnStorage,
	type Strategy,
} from '$lib/game/core/strategy';
import type {SubmissionStorageFormat} from '$lib/game/core/commit-reveal/storage';

/**
 * A PLAYED SEAT'S STRATEGY, ITS RANDOM SOURCE AND ITS STORED TURN, without a
 * chain: what a game's own pass relies on when it asks a seat for its turn.
 * The world test (`test/lib/offline-players.test.ts`) drives the same pieces
 * against a chain.
 */

type Action = {cellID: bigint};
const FORMAT: SubmissionStorageFormat<Action> = {
	encode: (action) => action.cellID.toString(),
	decode: (stored) => ({cellID: BigInt(stored as string)}),
};

const CONTRACT = '0x00000000000000000000000000000000000000aa' as const;
const OTHER_CONTRACT = '0x00000000000000000000000000000000000000bb' as const;
const KEY = 'a-world:played-turns';

function memoryStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	let failing = false;
	const storage: PlayedTurnStorage & {fail(): void; raw(): string | null} = {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			if (failing) throw new Error('the storage is full');
			map.set(key, value);
		},
		fail: () => void (failing = true),
		raw: () => map.get(KEY) ?? null,
	};
	return storage;
}

function storeOn(storage: PlayedTurnStorage, chainId = 1) {
	return createPlayedTurnStore<Action>({
		storage,
		key: KEY,
		chainId,
		contract: CONTRACT,
		format: FORMAT,
	});
}

describe('seededRandom', () => {
	const at = {chainId: 1, contract: CONTRACT, identity: 7n, cycleNumber: 3};

	it('reproduces: the same inputs give the same sequence', () => {
		const a = seededRandom(at);
		const b = seededRandom(at);
		const first = [a.next(), a.next(), a.below(10)];
		expect([b.next(), b.next(), b.below(10)]).toEqual(first);
	});

	it('differs per seat, per cycle, per chain and per game', () => {
		const first = seededRandom(at).next();
		expect(seededRandom({...at, identity: 8n}).next()).not.toBe(first);
		expect(seededRandom({...at, cycleNumber: 4}).next()).not.toBe(first);
		expect(seededRandom({...at, chainId: 2}).next()).not.toBe(first);
		expect(seededRandom({...at, contract: OTHER_CONTRACT}).next()).not.toBe(
			first,
		);
	});

	it('moves on with every draw, and keeps `below` in range', () => {
		const random = seededRandom(at);
		const draws = new Set<bigint>();
		for (let i = 0; i < 20; i++) draws.add(random.next());
		expect(draws.size).toBe(20);
		for (let i = 0; i < 200; i++) {
			const n = random.below(7);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThan(7);
			expect(Number.isInteger(n)).toBe(true);
		}
		expect(() => random.below(0)).toThrow();
	});
});

describe('the played-turn store', () => {
	it('keeps a turn per identity and cycle, and reads it back', () => {
		const store = storeOn(memoryStorage());
		expect(store.get(7n, 3)).toBeUndefined();
		store.put(7n, 3, [{cellID: 42n}]);
		expect(store.get(7n, 3)).toEqual([{cellID: 42n}]);
		expect(store.get(8n, 3)).toBeUndefined();
		expect(store.get(7n, 4)).toBeUndefined();
		// The EMPTY turn is a turn too: a seat that decided to do nothing has
		// decided, and must not decide again.
		store.put(8n, 3, []);
		expect(store.get(8n, 3)).toEqual([]);
	});

	it('is read from the storage, so another store over it (a reload) sees the turn', () => {
		const storage = memoryStorage();
		storeOn(storage).put(7n, 3, [{cellID: 42n}]);
		expect(storeOn(storage).get(7n, 3)).toEqual([{cellID: 42n}]);
	});

	it(`keeps the last ${COMMITTED_TURNS_KEPT} cycles per identity, and no more`, () => {
		const store = storeOn(memoryStorage());
		for (let cycle = 1; cycle <= COMMITTED_TURNS_KEPT + 2; cycle++) {
			store.put(7n, cycle, [{cellID: BigInt(cycle)}]);
			store.put(8n, cycle, [{cellID: BigInt(100 + cycle)}]);
		}
		for (const identity of [7n, 8n]) {
			expect(store.get(identity, 1)).toBeUndefined();
			expect(store.get(identity, 2)).toBeUndefined();
			for (let cycle = 3; cycle <= COMMITTED_TURNS_KEPT + 2; cycle++) {
				expect(store.get(identity, cycle)).toBeDefined();
			}
		}
	});

	it('replaces a turn written again for the same cycle', () => {
		const store = storeOn(memoryStorage());
		store.put(7n, 3, [{cellID: 1n}]);
		store.put(7n, 3, [{cellID: 2n}]);
		expect(store.get(7n, 3)).toEqual([{cellID: 2n}]);
	});

	it("drops another chain's records when it is created, which is a boot", () => {
		const storage = memoryStorage();
		storeOn(storage, 1).put(7n, 3, [{cellID: 1n}]);
		const later = storeOn(storage, 2);
		expect(later.get(7n, 3)).toBeUndefined();
		// Gone from the storage itself, not just hidden.
		expect(storage.raw()).not.toContain('"chainId":1');
		expect(storeOn(storage, 1).get(7n, 3)).toBeUndefined();
	});

	it('ignores what it cannot read: a malformed record, or a malformed key', () => {
		const good = {
			chainId: 1,
			contract: CONTRACT,
			identity: '7',
			cycleNumber: 3,
			actions: ['42'],
		};
		const storage = memoryStorage({
			[KEY]: JSON.stringify([
				{chainId: 1, contract: CONTRACT, identity: 'x', cycleNumber: 4},
				'nonsense',
				null,
				good,
			]),
		});
		const store = storeOn(storage);
		expect(store.get(7n, 3)).toEqual([{cellID: 42n}]);
		expect(store.get(7n, 4)).toBeUndefined();

		const garbage = memoryStorage({[KEY]: '{not json'});
		const fresh = storeOn(garbage);
		expect(fresh.get(7n, 3)).toBeUndefined();
		fresh.put(7n, 3, [{cellID: 1n}]);
		expect(fresh.get(7n, 3)).toEqual([{cellID: 1n}]);
	});

	it('throws when the write fails, so a caller that writes before it commits sends nothing', () => {
		const storage = memoryStorage();
		const store = storeOn(storage);
		storage.fail();
		expect(() => store.put(7n, 3, [{cellID: 1n}])).toThrow(/full/);
	});
});

describe('decidePlayedTurn', () => {
	function counting(actions: readonly Action[]) {
		const calls: Parameters<Strategy<Action>>[0][] = [];
		const strategy: Strategy<Action> = async (input) => {
			calls.push(input);
			return actions;
		};
		return {strategy, calls};
	}

	const input = (
		store: ReturnType<typeof storeOn>,
		strategy: Strategy<Action>,
	) => ({
		store,
		strategy,
		identity: 7n,
		cycleNumber: 3,
		level: 'greedy',
		random: seededRandom({
			chainId: 1,
			contract: CONTRACT,
			identity: 7n,
			cycleNumber: 3,
		}),
		budget: {actionsAtMost: 1},
	});

	it('asks the strategy once per cycle, and stores what it decided before handing it back', async () => {
		const storage = memoryStorage();
		const store = storeOn(storage);
		const {strategy, calls} = counting([{cellID: 5n}]);

		expect(await decidePlayedTurn(input(store, strategy))).toEqual([
			{cellID: 5n},
		]);
		expect(store.get(7n, 3)).toEqual([{cellID: 5n}]);
		expect(await decidePlayedTurn(input(store, strategy))).toEqual([
			{cellID: 5n},
		]);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			identity: 7n,
			cycleNumber: 3,
			level: 'greedy',
			budget: {actionsAtMost: 1},
		});
	});

	it('hands back the stored turn first, without asking', async () => {
		const store = storeOn(memoryStorage());
		store.put(7n, 3, [{cellID: 9n}]);
		const {strategy, calls} = counting([{cellID: 5n}]);
		expect(await decidePlayedTurn(input(store, strategy))).toEqual([
			{cellID: 9n},
		]);
		expect(calls).toHaveLength(0);
	});

	it('rejects when the turn cannot be stored, and hands nothing back to commit', async () => {
		const storage = memoryStorage();
		const store = storeOn(storage);
		storage.fail();
		const {strategy} = counting([{cellID: 5n}]);
		await expect(decidePlayedTurn(input(store, strategy))).rejects.toThrow(
			/full/,
		);
	});
});

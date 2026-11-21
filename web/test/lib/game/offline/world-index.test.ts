import {describe, it, expect} from 'vitest';
import {
	INDEXED_CHAIN_ID_STORAGE_KEY,
	forgetPreviousWorldIndex,
} from '$lib/game/offline/world-index';

/**
 * THE INDEX OF A WORLD THE LOBBY FORGOT, deleted when the next world starts
 * (K2-9): a step of the offline world on the branches that index it. Node
 * only, the deletion a fake (`deleteWorldIndex`'s own test is
 * `indexer/worker-choice.test.ts`).
 */

function memoryStorage(initial: Record<string, string> = {}) {
	const items = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
		items,
	};
}

describe('forgetPreviousWorldIndex', () => {
	it('deletes the index of the world indexed before, and remembers the one starting', () => {
		const storage = memoryStorage({[INDEXED_CHAIN_ID_STORAGE_KEY]: '111'});
		const deleted: [string, number][] = [];
		forgetPreviousWorldIndex({
			prefix: 'placement',
			chainId: 222,
			storage,
			deleteIndex: async (prefix, chainId) => {
				deleted.push([prefix, chainId]);
			},
		});
		expect(deleted).toEqual([['placement', 111]]);
		expect(storage.items.get(INDEXED_CHAIN_ID_STORAGE_KEY)).toBe('222');
	});

	it('keeps the index of the world starting again, and of a browser that indexed none', () => {
		const initials: Record<string, string>[] = [
			{[INDEXED_CHAIN_ID_STORAGE_KEY]: '222'},
			{},
		];
		for (const initial of initials) {
			const storage = memoryStorage(initial);
			const deleted: number[] = [];
			forgetPreviousWorldIndex({
				prefix: 'placement',
				chainId: 222,
				storage,
				deleteIndex: async (_, chainId) => {
					deleted.push(chainId);
				},
			});
			expect(deleted).toEqual([]);
			expect(storage.items.get(INDEXED_CHAIN_ID_STORAGE_KEY)).toBe('222');
		}
	});

	it('does not wait for the deletion, nor fail on it', async () => {
		const storage = memoryStorage({[INDEXED_CHAIN_ID_STORAGE_KEY]: '111'});
		let settle: (() => void) | undefined;
		const warned: unknown[] = [];
		const warn = console.warn;
		console.warn = (...args: unknown[]) => void warned.push(args);
		try {
			forgetPreviousWorldIndex({
				prefix: 'placement',
				chainId: 222,
				storage,
				deleteIndex: () =>
					new Promise((_, reject) => {
						settle = () => reject(new Error('blocked'));
					}),
			});
			expect(storage.items.get(INDEXED_CHAIN_ID_STORAGE_KEY)).toBe('222');
			settle?.();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(warned).toHaveLength(1);
		} finally {
			console.warn = warn;
		}
	});

	it('keeps the key every world on this branch has written', () => {
		expect(INDEXED_CHAIN_ID_STORAGE_KEY).toBe('offline-world:indexed-chain-id');
	});
});

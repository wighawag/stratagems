import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {
	boardWorkerFor,
	deleteWorldIndex,
	worldIndexDatabasePrefix,
} from '$lib/stratagems/board/worker-choice';
import {
	MAX_EMBEDDED_CHAIN_ID,
	MIN_EMBEDDED_CHAIN_ID,
} from '$lib/embedded/chain-id';

const GAME = '0x00000000000000000000000000000000000000Aa' as const;

function openDatabase(name: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name);
		request.onsuccess = () => {
			request.result.close();
			resolve();
		};
		request.onerror = () => reject(request.error);
	});
}

async function names(): Promise<string[]> {
	return (await indexedDB.databases()).map((d) => d.name!).sort();
}

describe("the board's indexer worker", () => {
	it('an embedded chain gets the world worker, named by its chain id', () => {
		for (const id of [MIN_EMBEDDED_CHAIN_ID, MAX_EMBEDDED_CHAIN_ID]) {
			expect(boardWorkerFor({chain: {id}, gameAddress: GAME})).toEqual({
				kind: 'embedded',
				name: `stratagems-world-${id}`,
			});
		}
	});

	it('any other chain gets the online worker, its election named per deployment', () => {
		const local = boardWorkerFor({chain: {id: 31337}, gameAddress: GAME});
		expect(local).toEqual({
			kind: 'online',
			name: `stratagems-31337-${GAME.toLowerCase()}`,
		});
		const base = boardWorkerFor({chain: {id: 8453}, gameAddress: GAME});
		expect(base.kind).toBe('online');
		// two deployments never share an election
		expect(base.name).not.toBe(local.name);
		expect(
			boardWorkerFor({chain: {id: 31337}, gameAddress: `0x${'bb'.repeat(20)}`})
				.name,
		).not.toBe(local.name);
	});

	it('forgetting a world deletes its databases, and only its', async () => {
		const world = MIN_EMBEDDED_CHAIN_ID + 5;
		const other = MIN_EMBEDDED_CHAIN_ID + 50;
		await openDatabase(`${worldIndexDatabasePrefix(world)}-stream-a`);
		await openDatabase(`${worldIndexDatabasePrefix(world)}-stream-b`);
		await openDatabase(`${worldIndexDatabasePrefix(other)}-stream-a`);
		await openDatabase('stratagems-31337-x');
		await deleteWorldIndex(world);
		// deletions are queued, not awaited: let them run
		await new Promise((resolve) => setTimeout(resolve, 20));
		const left = await names();
		expect(left).not.toContain(`${worldIndexDatabasePrefix(world)}-stream-a`);
		expect(left).not.toContain(`${worldIndexDatabasePrefix(world)}-stream-b`);
		expect(left).toContain(`${worldIndexDatabasePrefix(other)}-stream-a`);
		expect(left).toContain('stratagems-31337-x');
	});

	it('does nothing where IndexedDB cannot list its databases', async () => {
		const deleted: string[] = [];
		const factory = {
			deleteDatabase: (name: string) => deleted.push(name),
		} as unknown as IDBFactory;
		await expect(deleteWorldIndex(1, factory)).resolves.toBeUndefined();
		expect(deleted).toEqual([]);
	});

	it('a world whose id is a prefix of another is not the other', async () => {
		const world = MIN_EMBEDDED_CHAIN_ID + 7;
		await openDatabase(`${worldIndexDatabasePrefix(world)}0-stream`);
		await deleteWorldIndex(world);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(await names()).toContain(
			`${worldIndexDatabasePrefix(world)}0-stream`,
		);
	});
});

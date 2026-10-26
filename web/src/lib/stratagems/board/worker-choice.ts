/**
 * WHICH INDEXER WORKER A BOARD RUNS, and the name it is given (step O, P8, of
 * work/plans/join-template-commit-reveal.md).
 *
 * - A chain in this tab (an offline world, `isEmbeddedChainId`) is indexed by
 *   `./indexer.embedded.worker.ts`: no tab election, since no other tab can reach
 *   this tab's chain, and no publication, since nobody publishes a snapshot of a
 *   world. Its IndexedDB database is named after the world (the name below, which
 *   carries the minted chain id), kept across reloads, and deleted with the world
 *   (`worldIndexDatabasePrefix`).
 * - Any other chain is indexed by `./indexer.worker.ts`, ONE TAB INDEXING and
 *   the others reading, under an election named PER DEPLOYMENT (chain and game
 *   address). etherfold names the election by what the worker is told, and it
 *   used to be told the app's name, so an online tab and a world in another tab
 *   contended for one lease and the loser read a database nobody wrote.
 *
 * The name crosses as the worker's own (`new Worker(url, {name})`, read there as
 * `self.name`), because the worker's code is fixed at build time and the
 * deployment is not.
 */
import {isEmbeddedChainId} from '$lib/embedded/chain-id';

export type BoardWorker = {
	kind: 'embedded' | 'online';
	/** The worker's name: its election (online) or its database prefix (embedded). */
	name: string;
};

/** The prefix of every IndexedDB database an offline world's indexer writes. */
export function worldIndexDatabasePrefix(chainId: number): string {
	return `stratagems-world-${chainId}`;
}

export function boardWorkerFor(deployment: {
	chain: {id: number};
	gameAddress: `0x${string}`;
}): BoardWorker {
	const chainId = deployment.chain.id;
	if (isEmbeddedChainId(chainId)) {
		return {kind: 'embedded', name: worldIndexDatabasePrefix(chainId)};
	}
	return {
		kind: 'online',
		name: `stratagems-${chainId}-${deployment.gameAddress.toLowerCase()}`,
	};
}

/**
 * Delete every index an offline world left, best-effort: called when the world
 * is forgotten. Not awaited by a boot, since a database still held by a stopping
 * worker blocks its deletion until that worker lets go.
 */
export async function deleteWorldIndex(
	chainId: number,
	factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<void> {
	if (!factory?.databases) return;
	const prefix = worldIndexDatabasePrefix(chainId);
	const databases = await factory.databases();
	for (const {name} of databases) {
		if (name && (name === prefix || name.startsWith(`${prefix}-`))) {
			factory.deleteDatabase(name);
		}
	}
}

/**
 * Index a chain IN THIS NODE PROCESS with etherfold, and read the result with
 * GraphQL: what the contract tests and the `scripts/data/` helpers share.
 *
 * It replaces `ethereum-indexer-browser` + `ethereum-indexer-fs` (a JS object kept
 * in a file): etherfold deleted filesystem storage (its ADR-0041), and a Node
 * process keeps state in SQLite. So this is `createIndexerState` (the same hook the
 * browser uses) over a `VersionedStateStore` (`@etherfold/state-store-sqlite`) on
 * libSQL, `:memory:` by default or a file, which keeps the rows AND the sync
 * cursor, so a file-backed run resumes where the last one stopped.
 *
 * What is read back goes through GraphQL built from the processor's own entity
 * declarations (`localExecutor`), because a store has no "every row" read: that is
 * a query, and it is the one the web app asks too (`stratagems-indexer`'s
 * `readState`).
 */
import {createClient} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import {VersionedStateStore} from '@etherfold/state-store-sqlite';
import {fromEntityProcessor, openForWriting, type EntityProcessor} from '@etherfold/processor-entities';
import {createIndexerState} from '@etherfold/browser';
import {buildQuerySchema, localExecutor, type QueryExecutor} from '@etherfold/graphql';
import type {EIP1193ProviderWithoutEvents} from 'eip-1193';

export type IndexedInProcess = {
	/** GraphQL over the indexed state, pinned to one block per operation. */
	execute: QueryExecutor;
	/** Index what the chain has added since. */
	indexToLatest(): Promise<unknown>;
	close(): void;
};

export async function indexInProcess<ABI extends readonly unknown[]>(options: {
	processor: EntityProcessor<any>;
	provider: EIP1193ProviderWithoutEvents | {request(args: {method: string; params?: unknown}): Promise<unknown>};
	source: {
		chainId: string;
		genesisHash?: `0x${string}`;
		contracts: readonly {abi: ABI; address: `0x${string}`; startBlock?: number}[];
	};
	/** A libSQL url: `:memory:` (the default) or `file:./.data/<name>.db`. */
	db?: string;
	finality?: number;
}): Promise<IndexedInProcess> {
	const client = createClient({url: options.db ?? ':memory:'});
	const store = new VersionedStateStore(new RemoteLibSQL(client as never), options.processor.entities);
	const indexer = createIndexerState({
		// claimed: this process writes the store
		createState: async (_context, {signal}) => openForWriting(store, {signal}),
		createProcessor: (state) => fromEntityProcessor(options.processor)(state),
	});
	await indexer.init({
		provider: options.provider as never,
		source: options.source as never,
		...(options.finality !== undefined ? {config: {stream: {finality: options.finality}}} : {}),
	});
	await indexer.indexToLatest();

	const execute = localExecutor(buildQuerySchema(options.processor.entities), () => ({
		accessor: store.accessor(),
		generation: 'in-process',
		tip: async () => (await store.getBlockAtOrBelow(Number.MAX_SAFE_INTEGER))?.number,
		asOf: store.capabilities.asOf,
	}));

	return {
		execute,
		indexToLatest: () => indexer.indexToLatest(),
		close: () => client.close(),
	};
}

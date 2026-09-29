/**
 * The indexed game state, as the rest of the app reads it.
 *
 * The indexer runs in a dedicated worker (`indexer.worker.ts`, etherfold's
 * `@etherfold/browser`), which starts from the snapshot `pnpm indexer:index`
 * published and indexes forward through the user's own wallet. This tab holds a
 * PORT to it and never folds a block:
 *
 * - `state` is the ANSWER to the GraphQL questions in `stratagems-indexer`
 *   (`readState`), asked of the worker (`workerExecutor`) and asked again every
 *   time the worker says the state moved (`onStateMoved`), or the account whose
 *   commitment it reads changes. It has the shape the old JS processor's state had
 *   (`Data`), so the game logic that computes the view from it is unchanged.
 * - `syncing` is the worker's progress, as it pushes it.
 */
import {
	connectToIndexerHost,
	createProgressReadable,
	dedicatedWorkerHost,
	type HostProgress,
	type IndexerPort,
} from '@etherfold/browser';
import {workerExecutor} from '@etherfold/graphql/worker';
import {emptyData, indexingSource, readState, STREAM_FINALITY, StateQueryError, type Data} from 'stratagems-indexer';
import {derived, writable, type Readable} from 'svelte/store';
import {initialContractsInfos, remoteIndexedState} from '$lib/config';
import {account, connection, network} from '$lib/blockchain/connection';
import {browser} from '$app/environment';
import type {EIP1193Provider} from 'eip-1193';
import {logs} from 'named-logs';
import {url} from '$utils/path';

const namedLogger = logs('state');

/**
 * Where the publication index is, freshest first: the snapshot job's remote (when
 * this build names one, `PUBLIC_SNAPSHOT_URI` or `?snapshot=`), then the copy
 * embedded in this build (`static/indexed-states/<name>/`), which needs no host.
 * Absolute, because the worker resolves them against its own URL.
 */
function publicationLocations(): string[] {
	const embedded = new URL(url(`/indexed-states/${initialContractsInfos.name}/publication.json`), location.href).href;
	return remoteIndexedState ? [new URL('publication.json', remoteIndexedState).href, embedded] : [embedded];
}

const $state = writable<Data>(emptyData());
/** The last answer to the state questions: the whole game state, and the connected account's commitment. */
export const state: Readable<Data> & {readonly $state: Data} = {
	subscribe: $state.subscribe,
	get $state() {
		return current;
	},
};
let current: Data = emptyData();

const $progress = writable<HostProgress | undefined>(undefined);
/** The worker's progress: `phase` (`at-tip` once caught up), `lastToBlock`, `latestBlock`, `syncPercentage`, `publication`, `failure`. */
export const syncing: Readable<HostProgress | undefined> = {subscribe: $progress.subscribe};

/** Whether the state is caught up with the chain (what the UI waits for before letting a player act). */
export const indexedToLatest = derived(syncing, ($syncing) => $syncing?.phase === 'at-tip');

/** A query the worker refused or could not answer, shown rather than swallowed. */
export const queryError = writable<StateQueryError | undefined>(undefined);

let indexer: IndexerPort | undefined;
let execute: ReturnType<typeof workerExecutor> | undefined;

/**
 * Ask the state questions again. Answers can arrive out of order (the worker
 * answers concurrently), so each read takes a number and only the latest one is
 * written: an older answer landing late would show a past block.
 */
let latestRead = 0;
async function refresh() {
	if (!execute) return;
	const mine = ++latestRead;
	try {
		const read = await readState(execute, {account: account.$state.address ?? ''});
		if (mine !== latestRead) return;
		current = read.data;
		$state.set(read.data);
		queryError.set(undefined);
	} catch (err) {
		if (mine !== latestRead) return;
		namedLogger.error(`state query failed`, err);
		queryError.set(err instanceof StateQueryError ? err : new StateQueryError(String(err), undefined));
	}
}

function initialize(provider: EIP1193Provider) {
	indexer = connectToIndexerHost(
		dedicatedWorkerHost(() => new Worker(new URL('./indexer.worker.ts', import.meta.url), {type: 'module'})),
		{
			// the wallet's provider, served to the worker over a MessagePort
			provider: provider as never,
			settings: {
				source: indexingSource(initialContractsInfos) as never,
				// the finality the snapshot job published under: it is part of the stream
				// digest the publication index is keyed by
				config: {stream: {finality: STREAM_FINALITY}},
				publication: {locations: publicationLocations()},
			},
			onConnect: (outcome) => {
				if (!outcome.accepted) namedLogger.error(`the indexer worker refused this tab`, outcome.error);
			},
		},
	);
	execute = workerExecutor(indexer);

	// subscribe last: a listener may be called before the code after it runs
	const progress = createProgressReadable(indexer);
	progress.subscribe((value) => {
		$progress.set(value);
		if (value?.failure) namedLogger.error(`indexer stopped`, value.failure);
	});
	indexer.onStateMoved(() => void refresh());
	account.subscribe(() => void refresh());
	void refresh();
	namedLogger.log(`indexer worker started`);
}

/**
 * Start again from nothing: stop the worker and delete every stratagems state
 * database, so the next load starts from the published snapshot. For a wallet
 * whose node served inconsistent blocks (see `Web3ConnectionError.svelte`).
 */
export async function resetIndexer() {
	if (indexer) {
		await indexer.stopIndexing().catch(() => undefined);
		indexer.close();
		indexer = undefined;
		execute = undefined;
	}
	const databases = (await indexedDB.databases?.()) ?? [];
	await Promise.all(
		databases
			.filter((database) => database.name?.startsWith('stratagems-'))
			.map(
				(database) =>
					new Promise<void>((resolve) => {
						const request = indexedDB.deleteDatabase(database.name!);
						request.onsuccess = request.onerror = request.onblocked = () => resolve();
					}),
			),
	);
}

let provider: EIP1193Provider | undefined;
if (browser) {
	network.subscribe(($network) => {
		if ($network.chainId === initialContractsInfos.chainId) {
			try {
				if (!provider && connection.$state.provider !== undefined) {
					provider = connection.$state.provider;
					initialize(connection.$state.provider);
				}
			} catch (err) {
				console.error(`caught exception `, err);
			}
		}
	});
}

export function stringify(v: any) {
	return JSON.stringify(v, (k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v), 2);
}

if (typeof window !== 'undefined') {
	(window as any).state = state;
	(window as any).syncing = syncing;
	(window as any).stratagemsIndexer = {
		get port() {
			return indexer;
		},
		refresh,
	};
}

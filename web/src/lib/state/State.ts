/**
 * The indexed game state, as the rest of the app reads it.
 *
 * The indexer runs in a dedicated worker (`indexer.worker.ts`, etherfold's
 * `@etherfold/browser`), which starts from the snapshot `pnpm indexer:index`
 * published and indexes forward through the user's own wallet. This tab holds a
 * PORT to it and never folds a block:
 *
 * - `state` is the ANSWER to the GraphQL questions in `stratagems-indexer`,
 *   asked of the worker (`workerExecutor`): once in full, then, every time the
 *   worker says the state moved (`onStateMoved`), only the parts whose entities
 *   moved (`StateFollower`), and the commitment again when the account changes. It has the shape the old JS processor's state had
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
import {
	emptyData,
	indexingSource,
	STREAM_FINALITY,
	StateFollower,
	StateQueryError,
	type Data,
} from 'stratagems-indexer';
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

/**
 * Whether the state is caught up with the chain (what the UI waits for before
 * letting a player act): true once the worker has reached the tip, and kept while
 * it follows it, so each new block does not flash the syncing screen.
 */
let reachedTip = false;
export const indexedToLatest = derived(syncing, ($syncing) => {
	if ($syncing?.phase === 'at-tip') reachedTip = true;
	else if (!$syncing || $syncing.phase === 'refused' || $syncing.phase === 'waiting' || $syncing.phase === 'loading')
		reachedTip = false;
	return reachedTip;
});

/** A query the worker refused or could not answer, shown rather than swallowed. */
export const queryError = writable<StateQueryError | undefined>(undefined);

let indexer: IndexerPort | undefined;
let follower: StateFollower | undefined;

/** Read the whole state again (debug, and the browser verification). */
async function refresh() {
	await follower?.refreshAll();
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
	// Follows the state: one full read, then per state-moved signal a read of only the
	// parts whose entities moved, pinned to the block the signal names, so the parts
	// compose into the state of one block (stratagems-indexer's StateFollower).
	follower = new StateFollower(workerExecutor(indexer), account.$state.address ?? '', (err) => {
		namedLogger.error(`state query failed`, err);
		queryError.set(err);
	});
	follower.onUpdate((read) => {
		current = read.data;
		$state.set(read.data);
		queryError.set(undefined);
	});
	const following = follower;

	// subscribe last: a listener may be called before the code after it runs
	const progress = createProgressReadable(indexer);
	progress.subscribe((value) => {
		$progress.set(value);
		if (value?.failure) namedLogger.error(`indexer stopped`, value.failure);
	});
	indexer.onStateMoved((moved) => void following.moved(moved));
	account.subscribe(($account) => void following.setAccount($account.address ?? ''));
	void following.refreshAll();
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
		follower = undefined;
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
		/** The block the displayed state is as of (the verification waits on it). */
		get stateBlock() {
			return follower?.state?.block;
		},
	};
}

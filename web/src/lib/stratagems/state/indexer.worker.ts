/**
 * THE WORKER ENTRY: where the stratagems indexer RUNS (etherfold ADR-0082).
 *
 * The tab (`State.ts`) holds a PORT to this worker: it hands over the wallet's
 * provider and the settings it alone knows (the source, the stream config, where
 * the publication is), and reads the state back through GraphQL. Nothing folds on
 * the thread that paints.
 *
 * Copied from etherfold's `examples/browser-reference/browser/indexer.worker.ts`
 * and its guide's "Starting from a published snapshot", with two differences:
 *
 * - The processor is not imported as a module. It is the PUBLISHED BUNDLE, the
 *   very bytes `pnpm indexer:index` folded with (`static/processor.bundle.js`,
 *   copied from `stratagems-indexer/dist`), fetched and hashed here: a published
 *   snapshot is keyed by the processor's identity, the SHA-256 of those bytes, so
 *   only the same bytes find it.
 * - The store is bootstrapped from the snapshot the publication index names for
 *   this generation (`openAndBootstrap`, inside `stateFactoriesFrom`), and there is
 *   NO stream keeper: this is etherfold's snapshot-only mode (the job publishes with
 *   history `none` and no seed), so a processor change waits for the job to
 *   republish.
 */
import {createBrowserStateStore, hostIndexerInThisWorker, type InstantiatedProcessorBundle} from '@etherfold/browser';
import {graphqlQueryHandler} from '@etherfold/graphql/worker';
import {EntityEventProcessor, stateFactoriesFrom, type EntityProcessor} from '@etherfold/processor-entities';
import {STREAM_FINALITY, type StratagemsABI} from 'stratagems-indexer';
import {logs} from 'named-logs';

const logger = logs('stratagems:indexer-worker');

/**
 * Where the app is served from, read off this worker's own URL: the bundle is a
 * static file at the app's root, and the app is deployed under paths nobody knows
 * in advance (IPFS gateways), so no absolute path is right. A built worker lives
 * under SvelteKit's `_app/immutable/`; in development Vite serves it from `src/`.
 */
function appRoot(): string {
	const href = self.location.href;
	for (const marker of ['/_app/immutable/', '/src/lib/']) {
		const at = href.indexOf(marker);
		if (at >= 0) return href.slice(0, at + 1);
	}
	throw new Error(`cannot tell where the app is served from, given this worker's URL ${href}`);
}

/** The bundle's processor is the authoring object its bytes made: name the type it was built from. */
function definitionOf(bundle?: InstantiatedProcessorBundle): EntityProcessor<StratagemsABI> {
	if (!bundle) throw new Error('the stratagems worker runs the published processor bundle, and none arrived');
	return bundle.processor as EntityProcessor<StratagemsABI>;
}

hostIndexerInThisWorker({
	// The published bundle: fetched, named by the SHA-256 of its bytes, and
	// instantiated FROM those bytes (etherfold ADR-0095).
	processorBundle: {url: new URL('processor.bundle.js', appRoot())},
	// THE STORE, named ONCE: `stateFactoriesFrom` derives both seats of the tab
	// election from this one constructor, so the reader always opens the database
	// the leader writes.
	//
	// - `createState` (the tab that indexes) installs the published snapshot into an
	//   EMPTY store with `openAndBootstrap`, and downloads nothing when this tab already
	//   holds state, unless the host asks to REPLACE it after a catch-up that would take
	//   too long (`replaceLocal`, forwarded); then it claims the store (`openForWriting`).
	// - `openState` (every other tab) opens the same store snapshot-aware and for
	//   READING, with its `EntityStateView`: no claim, no download.
	//
	// ONE IndexedDB database per stream (source + stream config), so a redeploy's
	// source never lands in the rows of the previous one. The declarations come from
	// the published bundle's own processor.
	...stateFactoriesFrom({
		open: (context, entities) => createBrowserStateStore(entities, {databaseName: `stratagems-${context.stream}`}),
		// the finality the job published under: a snapshot inside the reorg window is refused
		finalityDepth: STREAM_FINALITY,
		onBootstrap: (outcome) => {
			logger.info(`published snapshot`, outcome);
			if (outcome.status === 'not-bootstrapped') {
				// said out loud: the tab then indexes from the start block, which on alpha1 is
				// ~40M blocks
				console.warn(`the published snapshot was not installed (${outcome.reason}): indexing from the start block`);
			}
		},
	}),
	createProcessor: (state, _context, bundle) => new EntityEventProcessor(state, definitionOf(bundle)),
	// ONE TAB INDEXES, THE OTHERS READ (etherfold ADR-0097). Without this, every open
	// stratagems tab fetches the chain through the wallet, and all but one then lose the
	// writer claim. The election is one Web Lock per app: the worker holding it builds
	// its store through `createState` (and bootstraps it); every other one is built from
	// `openState` and answers its tab's queries from the rows the leader writes. It takes
	// over when the leader's tab closes, or when its own tab is in front and the leader's
	// is hidden.
	tabElection: {name: 'stratagems'},
	// GraphQL, answered HERE where the store is (etherfold ADR-0099): the tab sends
	// documents with `workerExecutor` (`stratagems-indexer`'s `StateFollower`). The
	// IndexedDB scan refuses past 25,000 rows examined; alpha1's largest list, the
	// cells, examines 1,956 (see `indexer/oracle/2026-09-29-alpha1/README.md`).
	query: graphqlQueryHandler(),
});

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
 *   this generation (`openAndBootstrap`), and there is NO stream keeper: this is
 *   etherfold's snapshot-only mode (the job publishes with history `none` and no
 *   seed), so a processor change waits for the job to republish.
 */
import {createBrowserStateStore, hostIndexerInThisWorker, type InstantiatedProcessorBundle} from '@etherfold/browser';
import {graphqlQueryHandler} from '@etherfold/graphql/worker';
import {
	EntityEventProcessor,
	openAndBootstrap,
	openForWriting,
	type EntityProcessor,
} from '@etherfold/processor-entities';
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
	// ONE IndexedDB database per stream (source + stream config), so a redeploy's
	// source never lands in the rows of the previous one. `openAndBootstrap` installs
	// the published snapshot into an EMPTY store and downloads nothing when this tab
	// already holds state (unless the host asks to REPLACE it, after a catch-up that
	// would take too long: `replaceLocal`).
	createState: async (context, {signal}, bundle, published) => {
		const {store, outcome} = await openAndBootstrap(
			await createBrowserStateStore(definitionOf(bundle).entities, {databaseName: `stratagems-${context.stream}`}),
			published?.locations ?? [],
			{
				processor: published?.processor ?? 'none',
				replaceLocal: published?.replaceLocal,
				// the finality the job published under: a snapshot inside the reorg window is refused
				finalityDepth: STREAM_FINALITY,
			},
		);
		logger.info(`state store opened`, outcome);
		if (published && outcome.status === 'not-bootstrapped') {
			// said out loud: the tab then indexes from the start block, which on alpha1 is
			// ~40M blocks. `unreadable-format` is what a host that serves the `.gz` body with
			// `Content-Encoding: gzip` (Vite's dev server does) produces.
			console.warn(`the published snapshot was not installed (${outcome.reason}): indexing from the start block`);
		}
		return openForWriting(store, {signal});
	},
	createProcessor: (state, _context, bundle) => new EntityEventProcessor(state, definitionOf(bundle)),
	// GraphQL, answered HERE where the store is (etherfold ADR-0099): the tab sends
	// documents with `workerExecutor` (`stratagems-indexer`'s `readState`). The
	// IndexedDB scan refuses past 25,000 rows examined; alpha1's largest list, the
	// cells, examines 1,956 (see `indexer/oracle/2026-09-29-alpha1/README.md`).
	query: graphqlQueryHandler(),
});

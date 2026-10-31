/**
 * THE WORKER ENTRY: where the stratagems indexer RUNS on a live chain, hosted by
 * the framework (`$lib/indexer/host`, `with/indexer`): one tab indexes and the
 * others read, under the election the tab names this worker by, and a published
 * snapshot is installed when the tab names a publication.
 *
 * The processor is not imported as a module. It is the PUBLISHED BUNDLE, the
 * very bytes `pnpm indexer:index` folded with (`static/processor.bundle.js`,
 * copied from `stratagems-indexer/dist`), fetched and hashed by the host: a
 * published snapshot is keyed by the processor's identity, the SHA-256 of those
 * bytes, so only the same bytes find it. There is NO stream keeper: this is
 * etherfold's snapshot-only mode (the job publishes with history `none` and no
 * seed), so a processor change waits for the job to republish.
 *
 * The IndexedDB scan refuses past 25,000 rows examined; alpha1's largest list,
 * the cells, examined 1,956 (`indexer/oracle/2026-09-29-alpha1/README.md` at
 * the tag `alpha1-final`).
 */
import {appRoot, hostLiveIndexer} from '$lib/indexer/host';
import {STREAM_FINALITY} from 'stratagems-indexer';
import {logs} from 'named-logs';
import {INDEXER_PREFIX} from './prefix';

const logger = logs('stratagems:indexer-worker');

hostLiveIndexer({
	processorBundle: {url: new URL('processor.bundle.js', appRoot())},
	// `stratagems-<stream>`: one IndexedDB database per stream
	databasePrefix: INDEXER_PREFIX,
	// the finality the job published under: a snapshot inside the reorg window is refused
	finality: STREAM_FINALITY,
	onBootstrap: (outcome) => logger.info(`published snapshot`, outcome),
});

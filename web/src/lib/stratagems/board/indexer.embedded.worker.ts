/**
 * THE WORKER ENTRY FOR AN OFFLINE WORLD: the stratagems indexer folding the
 * chain that lives in this tab (`$lib/embedded`), hosted by the framework
 * (`$lib/indexer/host`): no tab election (nobody else can read this tab's
 * chain), no publication (nobody snapshots a world), so the processor is
 * imported as a module, and its database is the world's, named by this worker's
 * own name (`stratagems-world-<chainId>`), kept across reloads and deleted with
 * the world (`deleteWorldIndex` in `$lib/offline`).
 */
import {hostWorldIndexer} from '$lib/indexer/host';
import {stratagemsProcessor} from 'stratagems-indexer';

hostWorldIndexer({processor: stratagemsProcessor});

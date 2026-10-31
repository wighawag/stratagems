/**
 * THE REFERENCE GAME'S LIVE INDEXER WORKER: its processor, hosted by the
 * framework (`$lib/indexer/host`). A file of the game's because the bundler
 * has to see the processor's import here, and `./board.ts` starts it with a
 * literal `new Worker(new URL(...))`. It publishes no snapshot, so the
 * processor is imported rather than fetched as a bundle.
 */
import {hostLiveIndexer} from '$lib/indexer/host';
import {placementProcessor} from './processor';
import {STREAM_FINALITY} from './source';
import {INDEXER_PREFIX} from './prefix';

hostLiveIndexer({
	processor: placementProcessor,
	databasePrefix: INDEXER_PREFIX,
	finality: STREAM_FINALITY,
});

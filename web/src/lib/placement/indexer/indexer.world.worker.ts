/**
 * THE REFERENCE GAME'S OFFLINE-WORLD INDEXER WORKER: its processor folding the
 * chain in this tab, hosted by the framework (`$lib/indexer/host`).
 */
import {hostWorldIndexer} from '$lib/indexer/host';
import {placementProcessor} from './processor';

hostWorldIndexer({processor: placementProcessor});

/**
 * THE REFERENCE GAME'S BOARD FROM ITS INDEXER (`with/indexer`): what the
 * composition hands `createCommitRevealGame` as its `board` in place of the
 * poller. The same `BoardState` the poller gives, so nothing downstream (the
 * hold, the preview, the view) knows which one it reads.
 *
 * Everything here is the game's answer to one of `createIndexedState`'s
 * questions: which workers (its two entries, started by literal
 * `new Worker(new URL(...))` so the bundler sees them), what is indexed, how
 * the board is read, and where the cycle it is stamped with comes from.
 */
import type {Readable} from 'svelte/store';
import type {EIP1193Provider} from 'viem';
import {
	createIndexedState,
	indexerWorkerFor,
	type BlockTimestamps,
	type IndexedStateStore,
	type IndexerHost,
	type IndexerWorker,
} from '$lib/indexer';
import {isEmbeddedChainId} from '$lib/embedded/chain-id';
import type {CycleConfig} from '$lib/game/core/cycle';
import type {BoardState} from '$lib/placement/state';
import {INDEXER_PREFIX} from './prefix';
import {boardFollower} from './queries';
import {indexingSource, STREAM_FINALITY, type ContractsInfo} from './source';

/**
 * Which worker folds this deployment's board, and its name. A chain in this tab
 * (the offline world, `isEmbeddedChainId`) gets the world worker: which chains
 * are a world is the app's to say, and jolly-roger's `worker-choice.ts` calls
 * none a world by default.
 */
export function boardWorker(deployments: ContractsInfo): IndexerWorker {
	return indexerWorkerFor(
		INDEXER_PREFIX,
		deployments,
		deployments.contracts.Game.address,
		{isWorld: isEmbeddedChainId},
	);
}

export function createIndexedBoard(params: {
	/** The framework's chain provider (`connection.provider`). */
	provider: EIP1193Provider;
	publicClient: BlockTimestamps;
	deployments: ContractsInfo;
	cycle: CycleConfig;
	/** A test's host, in place of the game's worker. */
	host?: () => IndexerHost;
	player?: Readable<string | undefined>;
}): IndexedStateStore<BoardState & {cycleNumber: number}> {
	return createIndexedState({
		provider: params.provider,
		publicClient: params.publicClient,
		cycle: params.cycle,
		worker: boardWorker(params.deployments),
		startWorker: (worker) =>
			worker.kind === 'world'
				? new Worker(new URL('./indexer.world.worker.ts', import.meta.url), {
						type: 'module',
						name: worker.name,
					})
				: new Worker(new URL('./indexer.worker.ts', import.meta.url), {
						type: 'module',
						name: worker.name,
					}),
		host: params.host,
		source: indexingSource(params.deployments),
		finality: STREAM_FINALITY,
		follower: boardFollower,
		player: params.player,
		cycleOf: (data) => data.advancedCycle,
		present: (data, cycleNumber) => ({cells: data.cells, cycleNumber}),
	});
}

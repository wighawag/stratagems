/**
 * STRATAGEMS' BOARD, as the framework's state seam (`OnchainStateStore`): its
 * etherfold processor, hosted by the framework (`$lib/indexer`, `with/indexer`),
 * not the template's poller.
 *
 * What is stratagems' here is the answer to each of `createIndexedState`'s
 * questions:
 *
 * - its two worker entries (`./indexer.worker.ts`, the published bundle on a
 *   live chain; `./indexer.embedded.worker.ts`, the processor folding an
 *   offline world), started by literal `new Worker(new URL(...))` so the
 *   bundler sees both;
 * - what is indexed (`indexingSource`) and the finality the snapshot job
 *   publishes under, both from `stratagems-indexer`;
 * - WHERE THE PUBLICATION IS: the snapshot job's remote when this build names
 *   one (`PUBLIC_SNAPSHOT_URI`), then the copy embedded in this build
 *   (`static/indexed-states/<name>/`), found relative to the app as served,
 *   since the app is deployed under paths nobody knows in advance (IPFS
 *   gateways). A local chain has neither, and the worker then folds from the
 *   deployment's start block;
 * - how the state is read (`stratagems-indexer`'s parts and `readParts`; the
 *   connected player's commitment is the part that depends on who plays);
 * - the cycle the Manual stamp reads: the processor's `advancedCycle`.
 */
import {
	emptyData,
	indexingSource,
	PARTS,
	PART_OF_ENTITY,
	readParts,
	STREAM_FINALITY,
	type Data,
	type Part,
} from 'stratagems-indexer';
import type {Readable} from 'svelte/store';
import type {EIP1193Provider} from 'viem';
import {
	createIndexedState,
	indexerWorkerFor,
	type BlockTimestamps,
	type IndexedStateStore,
	type StateFollowerSpec,
} from '$lib/indexer';
import type {CycleConfig} from '$lib/game/core/cycle';
import {INDEXER_PREFIX} from './prefix';

/** The indexed state, as of one block, and the cycle the chain was in then. */
export type BoardState = {
	data: Data;
	cycleNumber: number;
};

export const emptyBoard = (): Data => emptyData();

/** What `rocketh-export` writes, as far as the indexer reads it. */
type Deployment = Parameters<typeof indexingSource>[0] & {name: string};

/** The board's parts, for the framework's follower. */
export const boardFollower: StateFollowerSpec<Part, Data> = {
	parts: PARTS,
	partOf: PART_OF_ENTITY,
	accountPart: 'commitments',
	read: (execute, parts, options) => readParts(execute, parts, options),
};

/** Where the publication index is: the remote first, then the embedded copy. Absolute, because the worker resolves them against its own URL. */
export function publicationLocations(
	deploymentName: string,
	appPath: (path: string) => string,
	snapshotURI: string | undefined,
	base: string = location.href,
): string[] {
	const embedded = new URL(
		appPath(`/indexed-states/${deploymentName}/publication.json`),
		base,
	).href;
	if (!snapshotURI) return [embedded];
	const remote = `${snapshotURI.replace(/\/$/, '')}/${deploymentName}/`;
	return [new URL('publication.json', remote).href, embedded];
}

export function createIndexedBoard(params: {
	/** The framework's chain provider (`connection.provider`). */
	provider: EIP1193Provider;
	publicClient: BlockTimestamps;
	deployment: Deployment;
	cycleConfig: CycleConfig;
	/** Whose commitment the follower reads too: who plays, lower-case or not. */
	player: Readable<`0x${string}` | undefined>;
	/** `PUBLIC_SNAPSHOT_URI`, when this build names one. */
	snapshotURI?: string;
	/** A path of the app as served (`$lib/kit/paths`' `url`). */
	appPath: (path: string) => string;
}): IndexedStateStore<BoardState> {
	return createIndexedState({
		provider: params.provider,
		publicClient: params.publicClient,
		cycle: params.cycleConfig,
		worker: indexerWorkerFor(
			INDEXER_PREFIX,
			params.deployment,
			params.deployment.contracts.Stratagems.address,
		),
		startWorker: (worker) =>
			worker.kind === 'world'
				? new Worker(new URL('./indexer.embedded.worker.ts', import.meta.url), {
						type: 'module',
						name: worker.name,
					})
				: new Worker(new URL('./indexer.worker.ts', import.meta.url), {
						type: 'module',
						name: worker.name,
					}),
		source: indexingSource(params.deployment),
		// the finality the snapshot job published under: part of the stream
		// digest the publication index is keyed by
		finality: STREAM_FINALITY,
		// asked when the worker starts, in the browser; a world has none
		publication: () => ({
			locations: publicationLocations(
				params.deployment.name,
				params.appPath,
				params.snapshotURI,
			),
		}),
		follower: boardFollower,
		player: params.player,
		cycleOf: (data) => data.advancedCycle?.cycleNumber,
		present: (data, cycleNumber) => ({data, cycleNumber}),
	});
}

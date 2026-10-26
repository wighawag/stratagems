/**
 * STRATAGEMS' BOARD, as the framework's state seam (`OnchainStateStore`): the
 * etherfold indexer, not the template's poller.
 *
 * The indexer runs in a dedicated worker (`./indexer.worker.ts`), which starts
 * from a published snapshot when there is one and folds forward; this tab holds a
 * PORT to it and reads the state back through GraphQL with `stratagems-indexer`'s
 * `StateFollower` (one full read, then only the parts whose entities moved). The
 * skeleton hands this store a `poll` it does not use.
 *
 * THE WORKER READS THROUGH THE FRAMEWORK'S PROVIDER (`connection.provider`, P6 of
 * step 6 in work/plans/join-template-commit-reveal.md), which is the app's RPC
 * when there is one (`PUBLIC_NODE_URL` or the chain's) and the wallet's
 * otherwise, so an account with no wallet still sees the board.
 *
 * STAMPED WITH ITS CYCLE, which is what the framework's handover and its
 * `catching-up` phase read: the cycle the chain was in at the block the state is
 * as of. That block is the last read's, or, once the worker is at the tip, the
 * last block it folded, because a block with no stratagems event moves no entity
 * and so triggers no read while the state is still current as of it. Without the
 * second, a quiet chain would leave the board a cycle behind the clock for ever.
 * The race this admits (a block folded whose re-read has not landed) cannot hide
 * a reveal at a cycle boundary: reveals land in their own cycle's reveal phase,
 * so their re-reads were asked for by earlier blocks.
 *
 * The cycle is computed from the block's timestamp with the deployment's timed
 * policy (`calculateCycleInfo`), which is exact while the contract's clock is the
 * block's (on a local chain stratagems reads a `Time` contract, whose offset is
 * zero unless someone moves it).
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
	type Data,
	type StateRead,
} from 'stratagems-indexer';
import {readable, writable, type Readable} from 'svelte/store';
import type {EIP1193Provider} from 'viem';
import {logs} from 'named-logs';
import type {TypedPublicClient} from '$lib/core/connection/types';
import {calculateCycleInfo, type CycleConfig} from '$lib/game/core/cycle';
import type {
	OnchainStateStatus,
	OnchainStateStore,
	OnchainStateValue,
} from '$lib/game/core/seams';

const logger = logs('stratagems:board');

/** The indexed state, as of one block, and the cycle the chain was in then. */
export type BoardState = {
	data: Data;
	cycleNumber: number;
};

export const emptyBoard = (): Data => emptyData();

/** What `rocketh-export` writes, as far as the indexer reads it. */
type Deployment = Parameters<typeof indexingSource>[0] & {name: string};

/**
 * Where the publication index is: the snapshot job's remote, when this build
 * names one, then the copy embedded in this build
 * (`static/indexed-states/<name>/`). Absolute, because the worker resolves them
 * against its own URL. A local chain has neither, and the worker then folds from
 * the deployment's start block.
 */
function publicationLocations(
	deploymentName: string,
	snapshotURI: string | undefined,
): string[] {
	const embedded = new URL(
		`indexed-states/${deploymentName}/publication.json`,
		document.baseURI,
	).href;
	if (!snapshotURI) return [embedded];
	const remote = `${snapshotURI.replace(/\/$/, '')}/${deploymentName}/`;
	return [new URL('publication.json', remote).href, embedded];
}

export function createIndexedBoard(params: {
	/** The framework's chain provider (`connection.provider`). */
	provider: EIP1193Provider;
	publicClient: TypedPublicClient;
	deployment: Deployment;
	cycleConfig: CycleConfig;
	/** Whose commitment the follower reads too: who plays, lower-case or not. */
	player: Readable<`0x${string}` | undefined>;
	/** `PUBLIC_SNAPSHOT_URI`, when this build names one. */
	snapshotURI?: string;
}): OnchainStateStore<BoardState> & {
	/** The worker's own progress, for a syncing indicator. */
	progress: Readable<HostProgress | undefined>;
} {
	const value = writable<OnchainStateValue<BoardState>>({step: 'Unloaded'});
	const status = writable<OnchainStateStatus>({loading: true});
	const progressStore = writable<HostProgress | undefined>(undefined);

	let indexer: IndexerPort | undefined;
	let follower: StateFollower | undefined;
	let lastRead: StateRead | undefined;
	let lastProgress: HostProgress | undefined;
	let stampedBlock = -1;
	const timestamps = new Map<number, Promise<number>>();

	function timestampOf(block: number): Promise<number> {
		let known = timestamps.get(block);
		if (!known) {
			known = params.publicClient
				.getBlock({blockNumber: BigInt(block)})
				.then((b) => Number(b.timestamp));
			known.catch(() => timestamps.delete(block));
			timestamps.set(block, known);
			if (timestamps.size > 64) {
				const oldest = timestamps.keys().next().value;
				if (oldest !== undefined) timestamps.delete(oldest);
			}
		}
		return known;
	}

	/** Publish the last read, stamped with the cycle of the block it is as of. */
	async function publish() {
		const read = lastRead;
		if (!read) return;
		const atTip = lastProgress?.phase === 'at-tip';
		const block = Math.max(
			read.block ?? 0,
			atTip ? (lastProgress?.lastToBlock ?? 0) : 0,
		);
		if (block === 0) return;
		try {
			const timestamp = await timestampOf(block);
			// a later publish may have overtaken this one while the block was read
			if (read !== lastRead || block < stampedBlock) return;
			stampedBlock = block;
			const {currentCycleNumber} = calculateCycleInfo(
				timestamp,
				params.cycleConfig,
			);
			value.set({step: 'Loaded', data: read.data, cycleNumber: currentCycleNumber});
			status.set({
				loading: !atTip,
				lastSuccessfulFetch: Date.now(),
			});
		} catch (error) {
			logger.error(`could not read block ${block}`, error);
			status.update((s) => ({
				...s,
				error: {message: `could not read block ${block}`, cause: error},
			}));
		}
	}

	function start(provider: EIP1193Provider) {
		const deployment = params.deployment;
		indexer = connectToIndexerHost(
			dedicatedWorkerHost(
				() =>
					new Worker(new URL('./indexer.worker.ts', import.meta.url), {
						type: 'module',
					}),
			),
			{
				provider: provider as never,
				settings: {
					source: indexingSource(deployment) as never,
					// the finality the snapshot job published under: part of the
					// stream digest the publication index is keyed by
					config: {stream: {finality: STREAM_FINALITY}},
					publication: {
						locations: publicationLocations(deployment.name, params.snapshotURI),
					},
				},
				onConnect: (outcome) => {
					if (!outcome.accepted) {
						logger.error(`the indexer worker refused this tab`, outcome.error);
						status.set({
							loading: false,
							error: {message: 'the indexer refused this tab', cause: outcome.error},
						});
					}
				},
			},
		);
		const following = new StateFollower(
			workerExecutor(indexer),
			'',
			(error) => {
				logger.error(`state query failed`, error);
				status.update((s) => ({
					...s,
					error: {message: error.message, cause: error},
				}));
			},
		);
		follower = following;
		following.onUpdate((read) => {
			lastRead = read;
			void publish();
		});
		// subscribe last: a listener may be called before the code after it runs
		createProgressReadable(indexer).subscribe((progress) => {
			lastProgress = progress;
			progressStore.set(progress);
			if (progress?.failure) {
				logger.error(`indexer stopped`, progress.failure);
				status.set({
					loading: false,
					error: {message: 'the indexer stopped', cause: progress.failure},
				});
				return;
			}
			void publish();
		});
		indexer.onStateMoved((moved) => void following.moved(moved));
		const stopPlayer = params.player.subscribe(
			(player) => void following.setAccount(player?.toLowerCase() ?? ''),
		);
		void following.refreshAll();
		return () => {
			stopPlayer();
			const port = indexer;
			indexer = undefined;
			follower = undefined;
			void port?.stopIndexing().catch(() => undefined);
			port?.close();
		};
	}

	// Started by its first subscriber, in the browser only, and stopped by its last.
	const lifecycle = readable<OnchainStateValue<BoardState>>(
		{step: 'Unloaded'},
		(set) => {
			if (typeof window === 'undefined') return;
			const stop = start(params.provider);
			const stopValue = value.subscribe(set);
			return () => {
				stopValue();
				stop();
			};
		},
	);

	return {
		subscribe: lifecycle.subscribe,
		status: {subscribe: status.subscribe},
		progress: {subscribe: progressStore.subscribe},
		async update() {
			await follower?.refreshAll();
		},
	};
}

/**
 * A GAME'S STATE FROM ITS INDEXER, as the framework's state seam
 * (`OnchainStateStore`): an etherfold processor folding the chain in a worker,
 * not the template's poller. What a game hands `createCommitRevealGame` as its
 * `board`, in place of `poll`.
 *
 * The indexer runs in a dedicated worker (`./host.ts`, through the game's two
 * worker entries, `./worker-choice.ts` choosing which); this tab holds a PORT
 * to it and reads the state back through GraphQL with a follower
 * (`./follower.ts`: one full read, then only the parts whose entities moved).
 *
 * THE WORKER READS THROUGH THE PROVIDER IT IS HANDED, which for a game is the
 * framework's (`connection.provider`): the app's RPC when there is one and the
 * wallet's otherwise, so an account with no wallet still sees the board.
 *
 * STAMPED WITH ITS CYCLE, which is what the framework's handover and its
 * `catching-up` phase read: the cycle the chain was in at the block the state
 * is as of. That block is the last read's, or, once the worker is at the tip,
 * the last block it folded, because a block with no event of the game moves no
 * entity and so triggers no read while the state is still current as of it.
 * Without the second, a quiet chain would leave the board a cycle behind the
 * clock for ever. The race this admits (a block folded whose re-read has not
 * landed) cannot hide a reveal at a cycle boundary: reveals land in their own
 * cycle's reveal phase, so their re-reads were asked for by earlier blocks.
 * How the cycle is known is `./cycle-stamp.ts`: the block's timestamp under the
 * timed policy, the game's own folded `CycleAdvanced` (`cycleOf`) under Manual.
 *
 * Written first in stratagems (its `board/indexed-board.ts`).
 */
import {
	connectToIndexerHost,
	createProgressReadable,
	dedicatedWorkerHost,
	type HostProgress,
	type IndexerPort,
} from '@etherfold/browser';
import {workerExecutor} from '@etherfold/graphql/worker';
import {readable, writable, type Readable} from 'svelte/store';
import type {EIP1193Provider} from 'viem';
import {logs} from 'named-logs';
import type {CycleConfig} from '$lib/game/core/cycle';
import type {
	OnchainStateStatus,
	OnchainStateStore,
	OnchainStateValue,
} from '$lib/game/core/seams';
import {
	assertStampable,
	stampedCycleNumber,
	stampNeedsTimestamp,
} from './cycle-stamp';
import {
	createStateFollower,
	type Execute,
	type StateFollower,
	type StateFollowerSpec,
	type StateRead,
} from './follower';
import type {IndexerWorker} from './worker-choice';

const logger = logs('indexer:state');

/** What the state needs of a public client: a block's timestamp, under the timed policy. */
export type BlockTimestamps = {
	getBlock(args: {blockNumber: bigint}): Promise<{timestamp: bigint}>;
};

/** An etherfold host a port can join: a worker (`dedicatedWorkerHost`) or, in a test, `indexer.mainThreadHost()`. */
export type IndexerHost = Parameters<typeof connectToIndexerHost>[0];

export type IndexedStateOptions<Part extends string, Data, State> = {
	/** The chain the worker folds: the framework's (`connection.provider`). */
	provider: EIP1193Provider;
	/** Where the block timestamps come from (the framework's `publicClient`). */
	publicClient: BlockTimestamps;
	cycle: CycleConfig;
	/** Which worker, and its name (`indexerWorkerFor`). */
	worker: IndexerWorker;
	/**
	 * The worker, started by the GAME's code: two literal
	 * `new Worker(new URL('./x.worker.ts', import.meta.url), {type: 'module', name})`
	 * so the bundler sees both entries. A test hands `host` instead.
	 */
	startWorker?: (worker: IndexerWorker) => Worker;
	/** The host itself, when it is not a dedicated worker (a test's `mainThreadHost`). */
	host?: () => IndexerHost;
	/** What is indexed: the game's contracts and the events its processor folds. */
	source: unknown;
	/** The stream's finality: part of the digest a publication is found by. */
	finality: number;
	/** Where the publication index is, for a live chain whose snapshot job publishes one. */
	publication?: {locations: string[]};
	/** The game's parts and how to read them. */
	follower: StateFollowerSpec<Part, Data>;
	/** Who plays, for a part that depends on it (`accountPart`). */
	player?: Readable<string | undefined>;
	/** The cycle the last `CycleAdvanced` left, as folded by the game (read under Manual only). */
	cycleOf: (data: Data) => number | undefined;
	/** What the seam publishes, from a read and its stamp. */
	present: (data: Data, cycleNumber: number) => State;
};

export type IndexedStateStore<State> = OnchainStateStore<State> & {
	/** The worker's own progress, for a syncing indicator. */
	progress: Readable<HostProgress | undefined>;
};

export function createIndexedState<Part extends string, Data, State>(
	options: IndexedStateOptions<Part, Data, State>,
): IndexedStateStore<State> {
	assertStampable(options.cycle);
	if (!options.startWorker && !options.host) {
		throw new Error(
			`an indexed state needs the game's worker (startWorker) or a host`,
		);
	}
	const value = writable<OnchainStateValue<State>>({step: 'Unloaded'});
	const status = writable<OnchainStateStatus>({loading: true});
	const progressStore = writable<HostProgress | undefined>(undefined);

	let follower: StateFollower<Data> | undefined;
	let lastRead: StateRead<Data> | undefined;
	let lastProgress: HostProgress | undefined;
	let stampedBlock = -1;
	const timestamps = new Map<number, Promise<number>>();

	function timestampOf(block: number): Promise<number> {
		let known = timestamps.get(block);
		if (!known) {
			known = options.publicClient
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
			const timestamp = stampNeedsTimestamp(options.cycle)
				? await timestampOf(block)
				: undefined;
			// a later publish may have overtaken this one while the block was read
			if (read !== lastRead || block < stampedBlock) return;
			stampedBlock = block;
			const cycleNumber = stampedCycleNumber(
				options.cycle,
				options.cycleOf(read.data),
				timestamp,
			);
			value.set({
				step: 'Loaded',
				...options.present(read.data, cycleNumber),
			});
			status.set({loading: !atTip, lastSuccessfulFetch: Date.now()});
		} catch (error) {
			logger.error(`could not read block ${block}`, error);
			status.update((s) => ({
				...s,
				error: {message: `could not read block ${block}`, cause: error},
			}));
		}
	}

	function onConnect(outcome: {accepted: boolean; error?: unknown}) {
		if (!outcome.accepted) {
			logger.error(`the indexer worker refused this tab`, outcome.error);
			status.set({
				loading: false,
				error: {message: 'the indexer refused this tab', cause: outcome.error},
			});
		}
	}

	function connect(): IndexerPort {
		// A test's host is already initialised with its provider and source, and
		// lives on this thread: nothing to hand it, and nothing to watch.
		if (options.host) {
			return connectToIndexerHost(options.host(), {watch: false, onConnect});
		}
		const startWorker = options.startWorker!;
		return connectToIndexerHost(
			dedicatedWorkerHost(() => startWorker(options.worker)),
			{
				provider: options.provider as never,
				settings: {
					source: options.source as never,
					config: {stream: {finality: options.finality}},
					// a world has no publication (nobody snapshots a chain in a tab)
					...(options.worker.kind === 'live' && options.publication
						? {publication: options.publication}
						: {}),
				},
				onConnect,
			},
		);
	}

	function start(): () => void {
		const indexer = connect();
		const following = createStateFollower(
			options.follower,
			workerExecutor(indexer) as Execute,
			{
				onError: (error) => {
					logger.error(`state query failed`, error);
					status.update((s) => ({
						...s,
						error: {message: error.message, cause: error},
					}));
				},
			},
		);
		follower = following;
		following.onUpdate((read) => {
			lastRead = read;
			void publish();
		});
		// subscribe last: a listener may be called before the code after it runs
		const stopProgress = createProgressReadable(indexer).subscribe(
			(progress) => {
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
			},
		);
		indexer.onStateMoved((moved) => void following.moved(moved as never));
		const stopPlayer = options.player?.subscribe(
			(player) => void following.setAccount(player?.toLowerCase() ?? ''),
		);
		void following.refreshAll();
		return () => {
			stopPlayer?.();
			stopProgress();
			follower = undefined;
			void indexer.stopIndexing().catch(() => undefined);
			indexer.close();
		};
	}

	// Started by its first subscriber, in the browser only, and stopped by its last.
	const lifecycle = readable<OnchainStateValue<State>>(
		{step: 'Unloaded'},
		(set) => {
			if (typeof window === 'undefined' && !options.host) return;
			const stop = start();
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

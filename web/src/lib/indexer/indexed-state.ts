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
 * timed policy, the game's own folded `CycleAdvanced` (`cycleOf`) under Manual,
 * and both under the hybrid policy.
 *
 * THE PLUMBING IS `createIndexed`'S (`./indexed.ts`, jolly-roger's): the port
 * to the worker, the follower, the worker's progress, the refusal and failure
 * statuses, the subscriber lifecycle and the `gate`. What is this file's is the
 * game's half: the stamp, and the mapping onto the framework's state seam.
 *
 * Written first in stratagems (its `board/indexed-board.ts`).
 */
import type {HostProgress} from '@etherfold/browser';
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
	stampedCycleNumber,
	stampNeedsTimestamp,
	type CycleAnchor,
} from './cycle-stamp';
import type {StateFollowerSpec, StateRead} from './follower';
import {
	createIndexed,
	type IndexedError,
	type IndexedValue,
	type IndexerHost,
} from './indexed';
import type {IndexerWorker} from './worker-choice';

export type {IndexerHost} from './indexed';

const logger = logs('indexer:state');

/** What the state needs of a public client: a block's timestamp, under the timed policy. */
export type BlockTimestamps = {
	getBlock(args: {blockNumber: bigint}): Promise<{timestamp: bigint}>;
};

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
	/**
	 * Where the publication index is, for a live chain whose snapshot job
	 * publishes one. Asked when the worker starts, in the browser, because the
	 * locations are usually found relative to the page (`location.href`).
	 */
	publication?: () => {locations: string[]} | undefined;
	/** The game's parts and how to read them. */
	follower: StateFollowerSpec<Part, Data>;
	/** Who plays, for a part that depends on it (`accountPart`). */
	player?: Readable<string | undefined>;
	/** Run only while this is truthy (the app's `chainFetchGate`); always when left out. */
	gate?: Readable<boolean>;
	/** The last re-anchoring `CycleAdvanced`, as folded by the game (read under Manual and hybrid). */
	cycleOf: (data: Data) => CycleAnchor | undefined;
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
	if (!options.startWorker && !options.host) {
		throw new Error(
			`an indexed state needs the game's worker (startWorker) or a host`,
		);
	}
	const indexed = createIndexed({
		provider: options.provider,
		worker: options.worker,
		startWorker: options.startWorker,
		host: options.host,
		source: options.source,
		finality: options.finality,
		publication: options.publication,
		follower: options.follower,
		account: options.player,
		gate: options.gate,
	});
	const value = writable<OnchainStateValue<State>>({step: 'Unloaded'});
	const status = writable<OnchainStateStatus>({loading: true});
	const progressStore = writable<HostProgress | undefined>(undefined);

	let lastRead: StateRead<Data> | undefined;
	let lastProgress: HostProgress | undefined;
	let lastError: IndexedError | undefined;
	let stampedBlock = -1;
	// bumped when the last subscriber leaves: a stamp still in flight then is dropped
	let run = 0;
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
		const publishing = run;
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
			// stopped meanwhile, or a later publish overtook this one while the block was read
			if (publishing !== run || read !== lastRead || block < stampedBlock) {
				return;
			}
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
			if (publishing !== run) return;
			logger.error(`could not read block ${block}`, error);
			status.update((s) => ({
				...s,
				error: {message: `could not read block ${block}`, cause: error},
			}));
		}
	}

	/** What `createIndexed` publishes, onto the seam's value, status and progress. */
	function follow(next: IndexedValue<Data>) {
		const progressMoved = next.progress !== lastProgress;
		const readMoved = next.read !== lastRead;
		lastRead = next.read;
		if (progressMoved) {
			lastProgress = next.progress;
			progressStore.set(next.progress);
		}
		const error = next.error;
		if (error !== lastError) {
			lastError = error;
			if (error) {
				const seamError = {message: error.message, cause: error.cause};
				if (error.kind === 'query') {
					status.update((s) => ({...s, error: seamError}));
				} else {
					// a refusal or a stop: the state is not current, and will not be
					status.set({loading: false, error: seamError});
				}
			}
		}
		// a new read or progress is published (which clears a failed query's
		// error, as a read landing does), unless the indexer refused or stopped
		if ((readMoved || progressMoved) && !(error && error.kind !== 'query')) {
			void publish();
		}
	}

	// Started by its first subscriber (in the browser only, while the gate is
	// open: `createIndexed`'s rules), and stopped by its last.
	const lifecycle = readable<OnchainStateValue<State>>(
		{step: 'Unloaded'},
		(set) => {
			const stopValue = value.subscribe(set);
			const stopIndexed = indexed.subscribe(follow);
			return () => {
				run++;
				stopIndexed();
				stopValue();
			};
		},
	);

	return {
		subscribe: lifecycle.subscribe,
		status: {subscribe: status.subscribe},
		progress: {subscribe: progressStore.subscribe},
		async update() {
			await indexed.refresh();
		},
	};
}

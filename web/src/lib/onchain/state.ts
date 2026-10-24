/**
 * The onchain-state seam.
 *
 * The template defines the CONTRACT here (see `$lib/game/core/seams`) and ships
 * one implementation of it: a poller that reads the game contract on an
 * interval, scoped to what the camera can see. That is what a game with a large
 * world and cheap reads wants.
 *
 * It is deliberately not the only possible implementation. A game whose state
 * is better built by replaying events (stratagems does this, through a
 * client-side indexer) supplies its own store satisfying `OnchainStateStore`
 * and the rest of the app does not notice: the view layer, the RPC-health
 * banner and the refresh connector only ever see the contract.
 */
import type {TypedPublicClient} from '$lib/core/connection/types';
import {createPollingStore} from '$lib/core/connection/polling-store';
import type {CameraWatcher} from '$lib/game/render/camera';
import type {ChainTimeStore} from '$lib/game/core/chain-time';
import type {CycleInfoStore} from '$lib/game/core/cycle';
import type {OnchainStateStore} from '$lib/game/core/seams';
import {
	refreshDuringReveal,
	settleBoardWhenCycleStarts,
	type BoardCycleState,
	type PlayWindow,
} from '$lib/game/core/refresh';
import {derived, type Readable} from 'svelte/store';

export type {
	OnchainStateStore,
	OnchainStateValue,
	OnchainStateStatus,
} from '$lib/game/core/seams';

/**
 * Reads state for a set of zones.
 *
 * A game implements this against its own getters: `getAvatarsInZone`,
 * `getStarSystems`, whatever it has. The framework only needs the cycle back,
 * so it can tell whether the answer is current.
 */
export type ZonesReader<TState> = (params: {
	zones: readonly bigint[];
	fromBlock: number;
	toBlock: number;
	expectedCycleNumber: number;
}) => Promise<(TState & {cycleNumber: number}) | undefined>;

/** Maps a camera box to the zones a game wants loaded for it. */
export type ZonesForCamera = (camera: {
	x: number;
	y: number;
	width: number;
	height: number;
}) => bigint[];

/**
 * What the current fetch is scoped to.
 *
 * The cycle is part of the identity because the contract answers per-cycle: the
 * same zones at a new cycle is a different question, and the answer to the old
 * one is stale.
 */
type FetchScope = {
	zones: bigint[];
	cycleNumber: number;
	averageBlockTime: number;
};

/** Stable identity, so panning inside the same zones does not refetch. */
function scopeKey(scope: FetchScope): string {
	return `${scope.cycleNumber}:${scope.zones.join(',')}`;
}

/**
 * How long to keep waiting for the node to reach the cycle we asked for.
 *
 * At a cycle boundary the client's clock crosses over before the node has
 * mined a block on the other side, so a read for the new cycle legitimately
 * comes back as "not yet". That is normal, not a fault: letting it reach the
 * polling store as an error would start exponential backoff (10s, 20s, 40s...)
 * that nothing cancels until the scope changes, and feed the RPC-health banner
 * a false outage. The player would see a blank board every cycle until they
 * happened to pan. Conquest hit exactly this; the budget scales with block time
 * so a slow chain gets proportionally longer.
 */
function nodeCatchupBudgetMs(averageBlockTime: number): number {
	return Math.max(2_000, averageBlockTime * 2_000);
}

const NODE_CATCHUP_RETRY_MS = 200;

/**
 * The fewest blocks a reader is ever handed for its logs: one request's worth
 * at the lowest `eth_getLogs` cap in common use.
 */
export const MIN_LOG_BLOCKS = 1000;

/**
 * The first block of the range a reader's logs are read over, ending at
 * `toBlock`.
 *
 * Roughly two cycles' worth, doubled, so late blocks cannot hide an event.
 * EXCEPT that a span sized in seconds has nothing to measure on two kinds of
 * chain, and both were found the same day (2026-09-26, by bomber-world's first
 * test that needed a log read offline):
 *
 * 1. A MANUAL cycle has no durations (the contracts refuse any), so four cycles
 *    of seconds is ZERO blocks and the range was the latest block alone. Every
 *    reveal in an earlier block went unread.
 * 2. A chain that mines blocks sharing a timestamp (the offline one does) makes
 *    `chain-time`'s average block time ZERO, and 0 / 0 is NaN. A NaN start made
 *    a chunking reader send no request at all: no error, no warning, and only
 *    when the sampled blocks happened to share a timestamp.
 *
 * So the span is floored at {@link MIN_LOG_BLOCKS}, and a span that is not a
 * finite number gets the floor. Logs are filtered by topic on the node, so a
 * wider range costs no extra results; a reader that reads no logs ignores the
 * range entirely.
 */
export function logRangeStart(params: {
	toBlock: number;
	cycleDuration: number;
	averageBlockTime: number;
}): number {
	const {toBlock, cycleDuration, averageBlockTime} = params;
	const sized = Math.floor((4 * cycleDuration) / averageBlockTime);
	const span = Number.isFinite(sized)
		? Math.max(sized, MIN_LOG_BLOCKS - 1)
		: MIN_LOG_BLOCKS - 1;
	return Math.max(0, toBlock - span);
}

/**
 * Knobs for the cycle-edge refresh policy. Defaults live in
 * `game/core/refresh`.
 */
export type RefreshPolicyConfig = {
	/** Cadence while a cycle is resolving. */
	revealIntervalMs?: number;
	/** How long that cadence outlives the window. */
	revealGraceMs?: number;
	/** Cadence of the catch-up when a cycle starts. */
	settleRetryMs?: number;
	/** How long the catch-up keeps trying before leaving it to the interval. */
	settleBudgetMs?: number;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readableTrue: Readable<boolean> = {
	subscribe(run) {
		run(true);
		return () => {};
	},
};

/**
 * The polling implementation of the state seam.
 *
 * What is fetched follows the camera and the cycle, so both are folded into the
 * polling store's `source`: a pan or a cycle tick triggers an immediate
 * refetch, and the interval is only a safety net.
 *
 * Every precondition (chain time pinned, camera sized, gate open) lives in the
 * scope rather than as a throw inside the fetch. A throw is read as a FAILED
 * read: it feeds the RPC-health banner a false outage and starts exponential
 * backoff that nothing cancels until the scope changes, which shows up as a
 * blank world until the player happens to pan.
 */
export function createPollingOnchainState<TState>(params: {
	publicClient: TypedPublicClient;
	camera: CameraWatcher;
	cycleInfo: CycleInfoStore;
	chainTime: ChainTimeStore;
	zonesForCamera: ZonesForCamera;
	/**
	 * One whole cycle, commit plus reveal, in seconds. A parameter because it is
	 * the GAME's config: the poller used to read it off `contracts.Game`'s
	 * linked data through a cast, which tied it to one contract name and typed
	 * nothing.
	 */
	cycleDuration: number;
	read: ZonesReader<TState>;
	emptyState: () => TState;
	config?: {
		fetchInterval?: number;
		/**
		 * The refresh policy at the two edges of a cycle. See
		 * `game/core/refresh.ts` for what each one is for and why the defaults
		 * are what they are. Pass `false` to run on the plain interval alone.
		 */
		refreshPolicy?: false | RefreshPolicyConfig;
	};
	/** Chain reads only run while this is truthy (no RPC yet, wallet not connected). */
	fetchGate?: Readable<boolean>;
}): OnchainStateStore<TState> {
	const {
		publicClient,
		camera,
		cycleInfo,
		chainTime,
		zonesForCamera,
		cycleDuration,
		read,
		emptyState,
	} = params;

	const scope = derived<
		[CameraWatcher, CycleInfoStore, ChainTimeStore, Readable<boolean>],
		FetchScope | undefined
	>(
		[camera, cycleInfo, chainTime, params.fetchGate ?? readableTrue],
		([$camera, $cycleInfo, $chainTime, $gate]) => {
			if (!$gate) return undefined;
			// Chain time has to be pinned to a block before a span of seconds can
			// become a span of blocks. It lands a few hundred ms after startup.
			if (!$chainTime.lastSync) return undefined;
			// The camera has no size until the canvas has laid itself out.
			if ($camera.width <= 0 || $camera.height <= 0) return undefined;
			return {
				zones: zonesForCamera($camera),
				cycleNumber: $cycleInfo.currentCycleNumber,
				averageBlockTime: $chainTime.lastSync.averageBlockTime,
			};
		},
	);

	const store = createPollingStore<TState, FetchScope | undefined>(
		async (currentScope) => {
			if (!currentScope) return emptyState();

			const deadline =
				Date.now() + nodeCatchupBudgetMs(currentScope.averageBlockTime);

			for (;;) {
				// The contract answers over a block range: see `logRangeStart` for how
				// it is sized. Re-read per attempt, since the point of retrying is that
				// the chain moves on.
				//
				// `cacheTime: 0` IS LOAD-BEARING. viem otherwise answers from a cache
				// as old as the client's polling interval (four seconds by default),
				// and this number is the block the reader pins to and ends its log
				// range at. Where a cycle is shorter than that - the offline world,
				// where it is under a second - the reveals were outside the range, so
				// there was no turn to replay and every move drew as a jump. See
				// test/lib/onchain/block-number.test.ts.
				const toBlock = Number(
					await publicClient.getBlockNumber({cacheTime: 0}),
				);
				const fromBlock = logRangeStart({
					toBlock,
					cycleDuration,
					averageBlockTime: currentScope.averageBlockTime,
				});

				const result = await read({
					zones: currentScope.zones,
					fromBlock,
					toBlock,
					expectedCycleNumber: currentScope.cycleNumber,
				});

				if (result) return result;

				// The node has not reached this cycle yet. Wait it out briefly rather
				// than reporting a failure (see nodeCatchupBudgetMs); if it persists
				// past the budget then something really is wrong and the error is
				// allowed through to the health banner and the backoff.
				if (Date.now() >= deadline) {
					throw new Error(
						`node did not reach cycle ${currentScope.cycleNumber} in time`,
					);
				}
				await delay(NODE_CATCHUP_RETRY_MS);
			}
		},
		{
			fetchInterval: params.config?.fetchInterval ?? 5_000,
			source: {store: scope, key: (s) => (s ? scopeKey(s) : undefined)},
		},
	);

	const update = async () => {
		await store.update();
	};

	// ---- the refresh policy at the two edges of a cycle ---------------------
	//
	// INSIDE THE POLLER, not left to each app to wire. The cycle model is the
	// framework's, so both of these consequences of it are too: every game on
	// this template would otherwise discover the same two faults for itself,
	// from play, which is how they were found the first time.

	const policy = params.config?.refreshPolicy;

	// The reveal window, as these policies see it. `isCommitPhase` is the honest
	// reading for both kinds of cycle: a timed chain and a manually advanced one
	// both answer it, where only a timed one has a countdown.
	const phase = derived(cycleInfo, ($cycleInfo): PlayWindow => ({
		phase: $cycleInfo.isCommitPhase ? 'play' : 'wait',
	}));
	const cycleNumber = derived(
		cycleInfo,
		($cycleInfo) => $cycleInfo.currentCycleNumber,
	);
	// The store's own value, read as "is it loaded, and for which cycle". The
	// reader stamps every loaded value with the cycle the fetch was FOR, which is
	// what makes "has the board caught up" answerable at all.
	const boardCycleNumber = derived(
		{subscribe: store.subscribe},
		($value): BoardCycleState =>
			$value.step === 'Loaded'
				? {
						step: 'Loaded',
						cycleNumber: ($value as unknown as {cycleNumber: number})
							.cycleNumber,
					}
				: {step: 'Unloaded'},
	);

	const settle = settleBoardWhenCycleStarts({
		phase,
		cycleNumber,
		state: boardCycleNumber,
		refresh: update,
		...(policy && policy.settleRetryMs !== undefined
			? {retryMs: policy.settleRetryMs}
			: {}),
		...(policy && policy.settleBudgetMs !== undefined
			? {budgetMs: policy.settleBudgetMs}
			: {}),
	});

	/**
	 * Ref-counted, and tied to the same lifetime the polling store uses.
	 *
	 * The policies exist to issue extra fetches, so starting them at
	 * construction would be IO before the app has started (ADR-0002) and would
	 * keep fetching for a board nobody is looking at. The polling store already
	 * starts on its first subscriber and stops on its last; these follow it, so
	 * there is one lifetime rather than two that can disagree.
	 */
	let subscribers = 0;
	let stopPolicy: (() => void) | undefined;

	function startPolicy() {
		// Off-browser there is nothing to refresh and a timer left behind would
		// outlive the render, exactly as the polling store's own guard says.
		if (typeof window === 'undefined') return;
		if (policy === false) return;
		const stopReveal = refreshDuringReveal({
			phase,
			refresh: update,
			...(policy && policy.revealIntervalMs !== undefined
				? {intervalMs: policy.revealIntervalMs}
				: {}),
			...(policy && policy.revealGraceMs !== undefined
				? {graceMs: policy.revealGraceMs}
				: {}),
		});
		const stopSettle = settle.watch();
		stopPolicy = () => {
			stopReveal();
			stopSettle();
		};
	}

	// Narrow the polling store to the seam: callers get the contract, not the
	// implementation, so swapping in an indexer stays a local change.
	return {
		subscribe(run, invalidate) {
			const unsubscribe = store.subscribe(run, invalidate);
			if (++subscribers === 1) startPolicy();
			let released = false;
			return () => {
				// Svelte calls an unsubscriber more than once in some teardown
				// orders, and a second call must not take the count below zero and
				// leave the policy running for the next subscriber to double up on.
				if (released) return;
				released = true;
				unsubscribe();
				if (--subscribers === 0) {
					stopPolicy?.();
					stopPolicy = undefined;
				}
			};
		},
		status: store.status,
		update,
	};
}

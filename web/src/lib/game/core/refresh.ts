/**
 * WHEN THE BOARD REFRESHES ITSELF, beyond the poller's own interval.
 *
 * A fixed interval plus "refetch when the scope changes" is the right policy
 * for most of a cycle and the wrong one at both of its edges. Two moments,
 * both reported from play rather than found by testing:
 *
 * DURING THE REVEAL WINDOW. Everything on the board changes at exactly one
 * moment in a cycle: the reveal phase, as each player's commitment resolves,
 * one transaction at a time. A browser that does not itself hold the submission
 * (a second player watching, the same player in another window) has nothing
 * local to tell it any of that happened, so it learns about a move up to a
 * whole interval late. At a 5s interval that reads as the board ignoring the
 * reveal until the next cycle has already started. {@link refreshDuringReveal}
 * runs a short cadence for the window instead.
 *
 * AT THE CYCLE BOUNDARY. The client's clock interpolates from the wall clock
 * between blocks, so it crosses into the new cycle BEFORE the chain has mined a
 * block past it. The poller asks for the new cycle, the contract answers from
 * its latest block with the old one, and a reader that requires an exact match
 * refuses the read. The catch-up budget then expires, the refusal reaches the
 * polling store as a FAILED fetch, and exponential backoff starts behind an
 * RPC-health banner - over a board that was never anything worse than a moment
 * behind. {@link settleBoardWhenCycleStarts} retries at a short cadence until
 * the board has actually caught up, which is bomber-world's retry-until-success
 * expressed as a policy with a budget.
 *
 * BOTH ARE FRAMEWORK, not app wiring. The cycle model is the framework's, so
 * the consequences of it are too: a game should not have to discover either of
 * these for itself, and every game on this template would discover them
 * identically. `onchain/state.ts` runs them for its poller; they live here,
 * apart from it, because they are policies over two stores and a callback, and
 * that is what makes them testable without a chain, a camera or an app context.
 */
import {get, type Readable} from 'svelte/store';

/**
 * The two-state view of a cycle these policies need: is the move window open?
 *
 * NAMED FOR THE QUESTION IT ANSWERS, and it used to be called `RoundPhase`,
 * which was then also the name of a different type entirely - now `CyclePhase`
 * in `core/cycle-phase.ts`, the four-part model the HUD reads. Two types with
 * one name in one repo is a mistake waiting for whoever imports the wrong one,
 * and neither compiler nor reviewer would notice: both are structurally about
 * phases.
 *
 * Structurally a subset of {@link TwoPhase}, so the cycle tracker's output
 * satisfies it directly and these policies stay testable with an object
 * literal.
 */
export type PlayWindow = {phase: 'play' | 'wait'};

/** What the board reports about itself: whether it is loaded, and for when. */
export type BoardCycleState =
	{step: 'Unloaded'} | {step: 'Loaded'; cycleNumber: number};

/**
 * Refresh on a short cadence while a cycle is resolving. Returns the teardown.
 *
 * THE FAST CADENCE OUTLIVES THE WINDOW BY A GRACE PERIOD, because late
 * landings cluster at the boundary: a reveal whose transaction was still in
 * flight when the clock crossed, a node whose block timestamps trail the wall
 * clock the client interpolates from. Observed as another player's piece
 * sitting still for a few seconds INTO the next cycle, which is the slow
 * poll's worst case showing through. Anything later than the grace is rare on
 * a quiet board, and the poller owns it.
 *
 * Nothing on the board can change during the commit phase - every action
 * resolves at reveal - so outside the window and its grace this is off, and a
 * second cadence there would only be a second bill from the RPC.
 */
export function refreshDuringReveal(params: {
	phase: Readable<PlayWindow>;
	refresh: () => Promise<unknown> | unknown;
	/** How often to refresh while reveals are landing. Defaults to 1.5s. */
	intervalMs?: number;
	/**
	 * How long to keep the fast cadence after the window closes. Defaults to
	 * 4s. Set it to 0 for the strict "only while waiting" behaviour.
	 */
	graceMs?: number;
}): () => void {
	const {phase, refresh} = params;
	const intervalMs = params.intervalMs ?? 1500;
	const graceMs = params.graceMs ?? 4000;

	let timer: ReturnType<typeof setInterval> | undefined;
	function stop() {
		if (timer !== undefined) {
			clearInterval(timer);
			timer = undefined;
		}
	}

	/**
	 * When the wait last ended, so the grace can be measured from it. Starts at
	 * minus infinity, so a page OPENED mid-play - which owes no catch-up - is
	 * already past any grace.
	 */
	let waitEnded: number | undefined = -Infinity;

	/**
	 * The interval checks the grace ITSELF rather than waiting for the phase to
	 * re-emit. A phase store derived from a clock ticks constantly and one
	 * derived from a manual cycle does not, and correctness that depends on a
	 * store continuing to emit is correctness borrowed rather than owned.
	 */
	function tick() {
		// `undefined` is "the window is still open", which is not a grace to
		// spend: the subtraction below would be NaN, so it is asked first.
		if (waitEnded !== undefined && Date.now() - waitEnded >= graceMs) {
			stop();
			return;
		}
		void refresh();
	}

	const unsubscribe = phase.subscribe(($phase) => {
		if ($phase.phase === 'wait') {
			waitEnded = undefined;
			stop();
			timer = setInterval(tick, intervalMs);
			return;
		}
		if (waitEnded === undefined) waitEnded = Date.now();
		if (timer === undefined && Date.now() - waitEnded < graceMs) {
			timer = setInterval(tick, intervalMs);
		}
	});

	return () => {
		stop();
		unsubscribe();
	};
}

/**
 * Bring the board up to date when a new cycle begins.
 *
 * THE MOMENT IS THE COMMIT PHASE STARTING. Every reveal that will ever land has
 * landed by then, so one fetch captures the settled board, and one fetch at
 * that point is what a spectating browser is owed: it has nothing of its own to
 * tell it a cycle ended, because the cycle, the secret and the reveal all
 * belong to whichever window holds them.
 *
 * THE FETCH RETRIES RATHER THAN GIVING UP, which is the actual fix. See the
 * file comment: the client crosses the boundary before the chain does, and a
 * poller that treats "not yet" as a failure backs off behind a health banner
 * while the new cycle is visibly underway on last cycle's board.
 *
 * ONE ATTEMPT PER CYCLE, with a budget. If the chain is so far behind that the
 * budget expires, this gives up and the background poller owns the recovery;
 * nothing promises a catch-up that is not happening.
 *
 * `watch()` rather than subscribing at construction, because subscribing to a
 * phase derived from chain time starts the chain clock, and ADR-0002 forbids IO
 * before the app has started.
 */
export function settleBoardWhenCycleStarts(params: {
	phase: Readable<PlayWindow>;
	/** The clock's cycle: which cycle the client believes is current. */
	cycleNumber: Readable<number>;
	/** The board's own state, whose `cycleNumber` says which cycle it reached. */
	state: Readable<BoardCycleState>;
	refresh: () => Promise<unknown> | unknown;
	/** How often to retry while the chain is behind the clock. Default 400ms. */
	retryMs?: number;
	/** How long to keep trying before leaving it to the poller. Default 10s. */
	budgetMs?: number;
}): {
	/** Open the phase subscription. Call from `start()`; returns the teardown. */
	watch(): () => void;
} {
	const {phase, cycleNumber, state, refresh} = params;
	const retryMs = params.retryMs ?? 400;
	const budgetMs = params.budgetMs ?? 10_000;

	let running = false;

	async function settle() {
		running = true;
		try {
			const deadline = Date.now() + budgetMs;
			for (;;) {
				// The budget is checked BEFORE the fetch, not after: a retry already
				// past it is a call to the RPC whose answer cannot be used.
				if (Date.now() >= deadline) break;
				await refresh();
				const $state = get(state);
				// `refresh` resolves when the fetch it triggered has landed, so a
				// state that is still not Loaded afterwards means the gate is closed
				// or the read failed. Retrying cannot help this cycle, and the poller
				// owns the recovery.
				if ($state.step !== 'Loaded') break;
				if ($state.cycleNumber >= get(cycleNumber)) break;
				await new Promise((resolve) => setTimeout(resolve, retryMs));
			}
		} finally {
			running = false;
		}
	}

	// STARTED AS PLAY, so a page opened mid-commit-phase gets no settle: the
	// poller is already fetching for the first time, and the transition this
	// waits for is the one into the NEXT cycle.
	let wasPlay = true;
	function watch(): () => void {
		const unsubscribe = phase.subscribe(($phase) => {
			const play = $phase.phase === 'play';
			const starting = play && !wasPlay;
			wasPlay = play;
			// Only the TRANSITION. A phase store derived from a clock re-emits on
			// every tick, and a settle per tick would be a fetch per tick.
			if (!starting) return;
			if (!running) void settle();
		});
		return () => {
			unsubscribe();
		};
	}

	return {watch};
}

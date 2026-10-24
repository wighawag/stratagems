import {describe, expect, it, vi, afterEach} from 'vitest';
import {get, writable} from 'svelte/store';
import {
	refreshDuringReveal,
	settleBoardWhenCycleStarts,
	type BoardCycleState,
	type PlayWindow,
} from '$lib/game/core/refresh';

/**
 * The two places the board refreshes itself beyond the poller's own interval,
 * and the reasoning each one exists for:
 *
 * - during the reveal window, because another player's move is invisible from
 *   here and a 5s poll turns the one moment the game is about into a wait;
 * - when a cycle starts, because the client's clock crosses the cycle boundary
 *   AHEAD of the chain, and the poller's own answer to that ("not yet", then
 *   backoff) leaves the new cycle playing on last cycle's board.
 *
 * Both are policies that act unprompted, so both are functions of two stores
 * and a callback, testable with fake timers and no chain, camera or app.
 */

/**
 * FRESH STORES PER TEST, and the leak that made it necessary is worth naming:
 * with one set shared across the file, a watcher a test forgot to stop stayed
 * subscribed, and the next test's `phase.set` woke it - scheduling timers the
 * next test then counted as its own. Shared mutable fixtures in a file about
 * timers are a way to debug the fixture instead of the code.
 */
function stores(initial: 'play' | 'wait' = 'play') {
	return {
		phase: writable<PlayWindow>({phase: initial}),
		clock: writable(7),
		board: writable<BoardCycleState>({step: 'Unloaded'}),
	};
}

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe('refreshDuringReveal', () => {
	it('refreshes on a short cadence while the reveal window is open', async () => {
		vi.useFakeTimers();
		const {phase} = stores();
		const refresh = vi.fn();
		const stop = refreshDuringReveal({phase, refresh, intervalMs: 1500});

		phase.set({phase: 'wait'});
		await vi.advanceTimersByTimeAsync(1500 * 3);
		expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(3);
		stop();
	});

	it('does nothing during the commit phase, when the board cannot change', async () => {
		// Nothing on the board can change while commitments are open - every
		// action resolves at reveal - so a second cadence here is only a second
		// bill from the RPC. `graceMs: 0` because this test is about the commit
		// phase PROPER: the grace after a wait is its own test below.
		vi.useFakeTimers();
		const {phase} = stores();
		const refresh = vi.fn();
		const stop = refreshDuringReveal({
			phase,
			refresh,
			intervalMs: 1500,
			graceMs: 0,
		});

		await vi.advanceTimersByTimeAsync(1500 * 3);
		expect(refresh).not.toHaveBeenCalled();
		stop();
	});

	it('keeps the fast cadence for a grace period after the window closes', async () => {
		// Late landings cluster at the boundary - a reveal still in flight when
		// the clock crossed, a node whose timestamps trail the wall clock - and
		// without the grace they wait for the poller's full interval. Observed
		// once as another player's piece standing still a few seconds into the
		// next cycle.
		vi.useFakeTimers();
		const {phase} = stores();
		const refresh = vi.fn();
		const stop = refreshDuringReveal({
			phase,
			refresh,
			intervalMs: 1500,
			graceMs: 4000,
		});

		phase.set({phase: 'wait'});
		phase.set({phase: 'play'});
		refresh.mockClear();
		await vi.advanceTimersByTimeAsync(1500);
		expect(refresh).toHaveBeenCalled();

		// Beyond the grace, the poller owns it again - and the interval stops
		// ITSELF rather than waiting for the phase store to say so. Two ticks
		// fall inside a 4s grace at a 1.5s cadence; the one at 4.5s turns it off.
		await vi.advanceTimersByTimeAsync(1500 * 4);
		expect(refresh).toHaveBeenCalledTimes(2);
		refresh.mockClear();
		await vi.advanceTimersByTimeAsync(1500 * 3);
		expect(refresh).not.toHaveBeenCalled();
		stop();
	});

	it('stops refreshing once the grace is spent, and lets go of everything when torn down', async () => {
		vi.useFakeTimers();
		const {phase} = stores();
		const refresh = vi.fn();
		const stop = refreshDuringReveal({
			phase,
			refresh,
			intervalMs: 1500,
			graceMs: 0,
		});

		phase.set({phase: 'wait'});
		await vi.advanceTimersByTimeAsync(1500);
		expect(refresh).toHaveBeenCalled();

		phase.set({phase: 'play'});
		refresh.mockClear();
		await vi.advanceTimersByTimeAsync(1500 * 2);
		expect(refresh).not.toHaveBeenCalled();

		// TORN DOWN FIRST, THEN THE WINDOW REOPENS, and that order is the test.
		// Entering `wait` before the teardown only proves `stop()` clears a timer;
		// a version written that way passed with the `unsubscribe()` deleted,
		// because the leak it was supposed to catch only shows when the phase
		// changes AFTER teardown - which is exactly what a cycle boundary does to
		// a binding whose owner has gone.
		stop();
		refresh.mockClear();
		phase.set({phase: 'wait'});
		await vi.advanceTimersByTimeAsync(1500 * 2);
		expect(refresh).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('settleBoardWhenCycleStarts', () => {
	it('does nothing until the commit phase begins, and nothing without watch()', async () => {
		// `watch()` is the switch because the subscription opens the chain clock,
		// and construction must not start IO (ADR-0002).
		vi.useFakeTimers();
		const {phase, clock, board} = stores();
		const refresh = vi.fn();
		settleBoardWhenCycleStarts({
			phase,
			cycleNumber: clock,
			state: board,
			refresh,
		});

		phase.set({phase: 'wait'});
		await vi.advanceTimersByTimeAsync(1000);
		expect(refresh).not.toHaveBeenCalled();
	});

	it('fetches until the board has caught up with the clock, then stops', async () => {
		vi.useFakeTimers();
		const {phase, clock, board} = stores();
		let calls = 0;
		const refresh = vi.fn(async () => {
			calls++;
			// The first two attempts find the chain still in the old cycle - the
			// client's clock crossed the boundary ahead of it - and the third
			// lands.
			board.set(
				calls >= 3
					? {step: 'Loaded', cycleNumber: 8}
					: {step: 'Loaded', cycleNumber: 7},
			);
		});
		const settle = settleBoardWhenCycleStarts({
			phase,
			cycleNumber: clock,
			state: board,
			refresh,
			retryMs: 400,
		});
		settle.watch();
		clock.set(8);

		phase.set({phase: 'wait'});
		phase.set({phase: 'play'});

		await vi.advanceTimersByTimeAsync(400);
		await vi.advanceTimersByTimeAsync(400);
		await vi.advanceTimersByTimeAsync(400);
		expect(refresh).toHaveBeenCalledTimes(3);
		// And it stops once the board has caught up, rather than fetching for the
		// rest of the window: two more ticks and nothing happened.
		await vi.advanceTimersByTimeAsync(400 * 2);
		expect(refresh).toHaveBeenCalledTimes(3);
	});

	it('does not restart on every clock tick of the same cycle', async () => {
		// A phase store derived from chain time re-emits on every tick, so the
		// settle has to trigger on the TRANSITION into the commit phase, not on
		// the phase value.
		vi.useFakeTimers();
		const {phase, clock, board} = stores();
		const refresh = vi.fn(async () => {
			board.set({step: 'Loaded', cycleNumber: get(clock)});
		});
		const settle = settleBoardWhenCycleStarts({
			phase,
			cycleNumber: clock,
			state: board,
			refresh,
		});
		const stop = settle.watch();

		phase.set({phase: 'wait'});
		phase.set({phase: 'play'});

		// LET THE FIRST SETTLE FINISH before re-emitting, which is the whole
		// point: three synchronous `play` emissions are all swallowed by the
		// in-flight guard, so a version of this test that fired them back to back
		// passed with the transition check deleted and proved nothing. The clock
		// re-emits for the rest of the cycle, long after the settle has finished.
		await vi.advanceTimersByTimeAsync(100);
		expect(refresh).toHaveBeenCalledTimes(1);

		phase.set({phase: 'play'});
		phase.set({phase: 'play'});
		await vi.advanceTimersByTimeAsync(100);
		expect(refresh).toHaveBeenCalledTimes(1);
		stop();
	});

	it('gives up after the budget rather than promising a catch-up forever', async () => {
		// A chain so far behind that the settle cannot land: it has to stop, and
		// the background poller owns the recovery from there.
		vi.useFakeTimers();
		const {phase, clock, board} = stores();
		const refresh = vi.fn(async () => {
			board.set({step: 'Loaded', cycleNumber: 7});
		});
		const settle = settleBoardWhenCycleStarts({
			phase,
			cycleNumber: clock,
			state: board,
			refresh,
			retryMs: 400,
			budgetMs: 1000,
		});
		clock.set(8);
		settle.watch();
		phase.set({phase: 'wait'});
		phase.set({phase: 'play'});

		await vi.advanceTimersByTimeAsync(2000);
		// It kept trying for the budget and not beyond it.
		expect(refresh).toHaveBeenCalledTimes(3);
	});

	it('stops at once when the board cannot load at all', async () => {
		// The fetch gate is closed, or the read failed: retrying cannot bring the
		// chain closer, and spinning for the whole budget would be noise.
		vi.useFakeTimers();
		const {phase, clock, board} = stores();
		const refresh = vi.fn(async () => {
			board.set({step: 'Unloaded'});
		});
		const settle = settleBoardWhenCycleStarts({
			phase,
			cycleNumber: clock,
			state: board,
			refresh,
			retryMs: 400,
		});
		settle.watch();
		phase.set({phase: 'wait'});
		phase.set({phase: 'play'});
		await vi.advanceTimersByTimeAsync(1000);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('lets go of its subscription when torn down', async () => {
		vi.useFakeTimers();
		const {phase, clock, board} = stores();
		const refresh = vi.fn();
		const settle = settleBoardWhenCycleStarts({
			phase,
			cycleNumber: clock,
			state: board,
			refresh,
		});
		const stop = settle.watch();
		stop();
		phase.set({phase: 'wait'});
		phase.set({phase: 'play'});
		await vi.advanceTimersByTimeAsync(1000);
		expect(refresh).not.toHaveBeenCalled();
	});
});

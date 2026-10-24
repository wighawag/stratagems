import {describe, expect, it} from 'vitest';
import {
	boardIsBehindClock,
	cyclePhaseOf,
	type CyclePhase,
} from '$lib/game/core/cycle-phase';

/**
 * The four-part model the HUD draws and the move gate reads.
 *
 * Two decisions in it are worth pinning, and neither is visible from reading
 * the wiring: which state WINS when two are true at once, and what "behind"
 * is measured against.
 */

const three = (phase: 'play' | 'commit' | 'reveal') => ({phase});

describe('cyclePhaseOf', () => {
	it('passes the clock through when the board has caught up', () => {
		expect(cyclePhaseOf(three('play'), false)).toBe('play');
		expect(cyclePhaseOf(three('commit'), false)).toBe('commit');
		expect(cyclePhaseOf(three('reveal'), false)).toBe('reveal');
	});

	it('puts the catch-up above whatever the clock says', () => {
		// The PRIORITY is the decision. A two-state model has no word for this at
		// all, so the catch-up gets reported as the phase the clock is in - and
		// the worst case is the clock saying `play` over last cycle's board, which
		// invites a plan built from a position that has already changed.
		for (const phase of ['play', 'commit', 'reveal'] as const) {
			expect(cyclePhaseOf(three(phase), true)).toBe('catching-up');
		}
	});

	it('produces only the four members, whatever it is given', () => {
		// Guards the guard: a fifth string leaking out would type-check at the
		// call site through a widened union and then fall through every switch
		// that draws or labels it, silently.
		const all: CyclePhase[] = ['play', 'commit', 'reveal', 'catching-up'];
		for (const phase of ['play', 'commit', 'reveal'] as const) {
			for (const behind of [true, false]) {
				expect(all).toContain(cyclePhaseOf(three(phase), behind));
			}
		}
	});
});

describe('boardIsBehindClock', () => {
	it('is behind when the board was fetched for an older cycle', () => {
		expect(
			boardIsBehindClock({
				board: {step: 'Loaded', cycleNumber: 6},
				currentCycleNumber: 7,
			}),
		).toBe(true);
	});

	it('has caught up once a fetch for this cycle has landed', () => {
		// STAMPED WITH THE CYCLE THE FETCH WAS FOR, which is what makes this end
		// within one fetch. Comparing against a block past the boundary instead
		// makes the catch-up wait for the next transaction on a node that mines
		// on transactions, which was measured at 15-20 seconds of waiting for a
		// COUNTER while the data had already arrived.
		expect(
			boardIsBehindClock({
				board: {step: 'Loaded', cycleNumber: 7},
				currentCycleNumber: 7,
			}),
		).toBe(false);
	});

	it('is never behind on a board that has not loaded', () => {
		// An unloaded board is ABSENT, not behind, and saying otherwise puts a
		// catch-up over the first paint of every session - a state the player
		// cannot act on, announced before there is anything to be late for.
		expect(
			boardIsBehindClock({board: {step: 'Unloaded'}, currentCycleNumber: 7}),
		).toBe(false);
		// Loaded without a cycle is the same case: nothing to compare.
		expect(
			boardIsBehindClock({board: {step: 'Loaded'}, currentCycleNumber: 7}),
		).toBe(false);
	});

	it('is not behind when the board is somehow AHEAD', () => {
		// Reachable at a boundary: the poller can land a fetch stamped for the new
		// cycle a moment before the local clock ticks over. Treating that as
		// behind would flash the catch-up at the start of every cycle, which is
		// the opposite of what it is for.
		expect(
			boardIsBehindClock({
				board: {step: 'Loaded', cycleNumber: 8},
				currentCycleNumber: 7,
			}),
		).toBe(false);
	});
});

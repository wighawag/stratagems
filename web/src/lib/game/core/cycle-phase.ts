/**
 * Which part of the cycle it is, in the terms a PLAYER experiences.
 *
 * The contract has two phases and the cycle tracker reports three (`ThreePhase`
 * in `./cycle.ts`: the move window, the lock while commitments land, the
 * reveal). Neither is what the screen has to say, because there is a fourth
 * state that the clock cannot see: the board is showing a cycle that is already
 * over, because a fetch for the new one has not landed yet.
 *
 * A two-state model (play / wait) is fine to play on and useless to debug
 * against, and it has no slot for the fourth at all - so the catch-up gets
 * reported as "wait", and a player watching a stale board is told the cycle is
 * resolving when in fact nothing is being waited for except a poll.
 *
 * BOTH HALVES ARE FRAMEWORK. The cycle model is the framework's, so the
 * consequences of it are too; and every game on this template would discover
 * this identically, because the gap between a client clock and a chain that
 * mines on transactions is a property of the arrangement rather than of any
 * game. What a game owns is what it DRAWS: `game/ui/GameClock.svelte` is one
 * offered dial, and a game that wants another writes it against this type.
 */

/** The four-part model the HUD and the move gate read. */
export type CyclePhase = 'play' | 'commit' | 'reveal' | 'catching-up';

/**
 * Which part of the cycle this is, from the three-phase tracker and whether the
 * board is behind the clock.
 *
 * CATCHING-UP WINS over the phase the clock says, deliberately: if the board is
 * behind, that is the more actionable truth, whether the clock thinks it is the
 * lock, the reveal or a new window. The alternative ordering is the bug it was
 * written to remove - a fresh move window announced over last cycle's board, so
 * the player plans a turn from a position that has already changed.
 *
 * Pure, and exported rather than inlined, because the HUD and the move gate
 * both read it and neither should re-derive it: two answers to "can I move
 * now?" is how a board accepts a click it is about to refuse.
 */
export function cyclePhaseOf(
	three: {phase: 'play' | 'commit' | 'reveal'},
	boardBehindClock: boolean,
): CyclePhase {
	if (boardBehindClock) return 'catching-up';
	if (three.phase === 'reveal') return 'reveal';
	if (three.phase === 'commit') return 'commit';
	return 'play';
}

/**
 * Whether the board is showing a cycle that has already ended.
 *
 * STAMPED WITH THE CYCLE THE FETCH WAS FOR, not with the chain's current one,
 * and that distinction is the whole of it. Comparing against the CHAIN's cycle
 * makes this wait for a block past the boundary, and on a node that mines only
 * on transactions that block is the next player's commit - so the catch-up
 * lasts twenty seconds while the data it is waiting for arrived immediately.
 * Nothing the board reads can change in that gap: a reveal mined after the
 * boundary is refused (it lands in a commit phase), and a commit moves nothing,
 * so anything that DOES change state mines the block itself.
 *
 * Read as "no fetch has landed since the cycle changed", it ends within one
 * fetch, which is what makes it a flash rather than a state.
 */
export function boardIsBehindClock(params: {
	/** What the board reports about itself. */
	board: {step: string; cycleNumber?: number};
	/** The cycle the clock says it is. */
	currentCycleNumber: number;
}): boolean {
	const {board, currentCycleNumber} = params;
	// An unloaded board is not BEHIND, it is absent, and saying otherwise puts a
	// catch-up over the first paint of every session.
	if (board.step !== 'Loaded' || board.cycleNumber === undefined) return false;
	return board.cycleNumber < currentCycleNumber;
}

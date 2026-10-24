/**
 * The handover between the local submission and the board.
 *
 * A turn in a commit-reveal game is drawn twice by two different things, and
 * the moment they change hands is not free. BEFORE the submission resolves,
 * what is on screen is LOCAL INTENT, built from the actions the submission is
 * carrying. AFTER it resolves, the same turn is drawn from the BOARD, which is
 * whatever the game's onchain-state store says. Both halves of that swap are
 * here, because they have to happen at the SAME moment and there is exactly one
 * way to guarantee that: publish the moment rather than letting each side work
 * out "roughly now" for itself.
 *
 * Two framework facts make this a framework problem rather than one game's
 * cosmetic bug, and every game on this template would hit both.
 *
 * **A cycle is SIMULTANEOUS and its reveals are not.** That is the whole
 * reason to pay for commitments at all: everyone's turn resolves together. But
 * the reveals arrive one transaction at a time, in whatever order the mempool
 * delivers them, so a board that applies each one as it lands shows the cycle
 * playing out in the order players PAID, drawn as if it were the order they
 * acted in. It is not what happened, and it leaks who was quick to reveal.
 * {@link holdBoardUntilCycleEnds} withholds the resolving cycle's changes
 * until the cycle is over, and then lets them out together.
 *
 * **The submission drops its actions at `Revealed`.** {@link SubmissionState}
 * carries them at every step up to and including `Revealing` and not after,
 * which is correct - there is nothing left to change - but it means the local
 * overlay vanishes the instant the reveal transaction lands, seconds before the
 * board is willing to show what that transaction did. Between those two moments
 * a player is shown NEITHER copy of their own turn. {@link rememberTurn} is the
 * smallest memory that closes it, and {@link heldTurnUntilBoardReleases} ties
 * that memory to the board's own release signal.
 *
 * WHAT IS NOT HERE, deliberately: what counts as "this cycle's outcome" for a
 * particular game's state, and what a turn LOOKS like. The first is the
 * `hold` callback below, because it is a statement about the game's own entity
 * shape; the second is whatever the game merges into its view. The seam falls
 * where it does everywhere else on this template: the framework owns the
 * consequences of its own model (a cycle with phases, a board with a cycle),
 * and the game owns its content.
 */
import {derived, type Readable} from 'svelte/store';
import type {SubmissionState} from './submission';
import type {PlayWindow} from './refresh';
import type {OnchainStateStore, OnchainStateValue} from './seams';

/**
 * The board to draw, and whether it is currently holding a cycle back.
 *
 * TWO VIEWS OF ONE COMPUTATION, which is the point of returning them together.
 * Whatever draws local intent has to stay on screen until the exact moment the
 * board lets the cycle's outcome out, and "roughly then" - a second reading of
 * the cycle, of the cycle, or of the phase - is how the two end up disagreeing
 * by a frame or a poll, which is the class of bug this file exists to avoid.
 */
export type HeldBoard<TState> = {
	board: OnchainStateStore<TState>;
	/**
	 * The cycle whose outcome is being held back right now, or undefined when
	 * the board is showing everything it has.
	 *
	 * It goes undefined at the RELEASE, which is what the overlay waits for.
	 */
	holding: Readable<number | undefined>;
};

/**
 * What a game does with the cycle that is resolving right now.
 *
 * Called with the board currently ON SCREEN and the board the chain has just
 * reported, and returns what to draw. The framework cannot write this: it
 * needs to know which parts of a game's state the resolving cycle changed, and
 * only the game knows what its state is made of.
 *
 * Two rules worth stating, because both are easy to get wrong once and never
 * notice:
 *
 * - **Hold only what the RESOLVING cycle changed.** Anything else - an entity
 *   that has not acted, a region that came into view when the player panned -
 *   must pass straight through, or the board is stale rather than
 *   synchronised.
 * - **Prefer showing something over hiding it when the inputs are
 *   incomplete.** A game that decides "held or not" from data it is allowed to
 *   fail to fetch will, on the fetch that fails, either blank a live board or
 *   release the whole cycle early. Decide from the read that carries the state
 *   itself wherever there is one.
 */
export type HoldResolvingCycle<TState> = (params: {
	/** What is on screen: the last board this returned. */
	shown: TState;
	/** What the chain says now. */
	latest: TState;
	/** The cycle whose reveals are landing. */
	resolvingCycleNumber: number;
}) => TState;

/**
 * The board store the renderer reads: the game's own, with the resolving
 * cycle's outcome held back until the cycle is over.
 *
 * A WRAPPER rather than something inside the state store, because what is held
 * is a DISPLAY decision and the store's job is to know what the chain says.
 * Anything about FETCHING - a settle, a catch-up indicator, RPC health - keeps
 * reading the raw store for exactly that reason.
 *
 * The memory is the last board it handed out, so successive fetches during the
 * window hold against what is on screen rather than drifting.
 *
 * ONE DERIVE, TWO VIEWS OF IT, which is what makes the handover safe. The
 * board's release and the overlay's clearing then happen in the SAME
 * propagation, so whichever of the two is subscribed first, the pair is
 * consistent and there is never a frame with neither on screen.
 */
export function holdBoardUntilCycleEnds<
	TState extends {cycleNumber: number},
>(params: {
	state: OnchainStateStore<TState>;
	/** `play` is the move window; `wait` is the lock and the reveal. */
	phase: Readable<PlayWindow>;
	/** The clock's cycle, which during the wait is the cycle being resolved. */
	cycleNumber: Readable<number>;
	/** What this game holds back. See {@link HoldResolvingCycle}. */
	hold: HoldResolvingCycle<TState>;
}): HeldBoard<TState> {
	const {state, phase, cycleNumber, hold} = params;
	let shown: TState | undefined;

	const held = derived(
		[{subscribe: state.subscribe}, phase, cycleNumber],
		([$state, $phase, $cycleNumber]): {
			value: OnchainStateValue<TState>;
			holding: number | undefined;
		} => {
			const board = $state as OnchainStateValue<TState>;
			if (board.step === 'Unloaded') {
				// The board is no longer known to be true (an account switch, a chain
				// reset). There is nothing to hold and nothing to synchronise.
				shown = undefined;
				return {value: board, holding: undefined};
			}

			// The state without the marker the store wraps it in, which is what a
			// game's own rule is written against.
			const latest = withoutStep(board);

			// Outside the window, or with nothing on screen yet to hold against,
			// the newest answer IS the board.
			if (($phase as PlayWindow).phase !== 'wait' || !shown) {
				shown = latest;
				return {value: loaded(shown), holding: undefined};
			}

			const resolvingCycleNumber = $cycleNumber as number;
			shown = hold({shown, latest, resolvingCycleNumber});
			return {
				value: loaded(shown),
				holding: resolvingCycleNumber,
			};
		},
	);

	const value = derived(held, ($held) => $held.value);
	const holding = derived(held, ($held) => $held.holding);

	return {
		board: {
			subscribe: value.subscribe,
			status: state.status,
			update: state.update,
		},
		holding,
	};
}

/**
 * The game's own state, with the store's `Loaded` marker taken off.
 *
 * Stripped rather than passed through, so a game's hold rule is written
 * against the state it defined and cannot be handed a field the framework
 * added.
 */
function withoutStep<TState>(board: {step: 'Loaded'} & TState): TState {
	const copy = {...(board as object)} as Record<string, unknown>;
	delete copy.step;
	return copy as TState;
}

function loaded<TState>(state: TState): OnchainStateValue<TState> {
	return {...(state as object), step: 'Loaded'} as OnchainStateValue<TState>;
}

/** A turn the submission was carrying, and which cycle it belonged to. */
export type RememberedTurn<TAction> = {
	cycleNumber: number;
	actions: readonly TAction[];
};

/**
 * The last turn the submission carried.
 *
 * Exists because `Revealed` deliberately carries no actions, so anything that
 * still has something to say about the turn just played has to have been
 * WATCHING. This is the smallest thing that can be: one value, replaced
 * whenever the submission holds a turn at all.
 *
 * THE LAST ONE WINS, EMPTY INCLUDED. A player who plans a path and then clears
 * it has planned nothing, and a memory that only accepted non-empty turns
 * would redraw the path they deleted for the whole of the cycle it resolves
 * in. For a game that commits empty turns to stay alive (`commitWhenIdle`),
 * an empty turn is also the ordinary case rather than an edge one.
 */
export function rememberTurn<TAction>(
	submission: Readable<SubmissionState<TAction>>,
): Readable<RememberedTurn<TAction> | undefined> {
	let last: RememberedTurn<TAction> | undefined;
	return derived(submission, ($submission) => {
		if ('actions' in $submission) {
			last = {
				cycleNumber: $submission.cycleNumber,
				actions: $submission.actions,
			};
		}
		return last;
	});
}

/**
 * The turn to keep drawing as local intent, or undefined to draw whatever the
 * submission currently says.
 *
 * The bridge across the handover: it answers with the remembered turn for
 * exactly as long as the board is withholding the cycle that turn belongs to,
 * and with nothing before or after.
 *
 * MATCHED BY CYCLE rather than merely taken when present, or a turn remembered
 * from an earlier cycle is resurrected over a cycle in which the player
 * planned nothing at all.
 *
 * IT WINS OVER THE LIVE SUBMISSION while it answers, even when the submission
 * still holds the same actions. It is never staler: anything derived from the
 * submission re-derives when the submission changes, so a consumer that
 * preferred the live value would draw one frame of a turn that has already
 * moved on.
 *
 * FOR DISPLAY ONLY. Nothing that CONTROLS a turn should read this: undo, clear,
 * a planned count and every affordance around them keep reading the submission,
 * because once a turn is committed there is nothing left to undo and a held
 * display copy must not make the UI offer it.
 */
export function heldTurnUntilBoardReleases<TAction>(params: {
	submission: Readable<SubmissionState<TAction>>;
	/**
	 * Which cycle the board is holding back, from the board itself.
	 *
	 * `undefined` is the release, and it is the ONE moment both halves of the
	 * handover turn on. See {@link HeldBoard.holding}.
	 */
	holding: Readable<number | undefined>;
}): Readable<readonly TAction[] | undefined> {
	const remembered = rememberTurn(params.submission);
	return derived(
		[remembered, params.holding],
		([$remembered, $holding]): readonly TAction[] | undefined => {
			if ($holding === undefined) return undefined;
			if ($remembered?.cycleNumber !== $holding) return undefined;
			return $remembered.actions;
		},
	);
}

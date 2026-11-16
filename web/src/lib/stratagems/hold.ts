/**
 * What the board shows while a cycle resolves, and the turn shown until it does
 * (the framework's handover, `$lib/game/core/handover`).
 *
 * THE WHOLE BOARD IS HELD through the reveal phase: in stratagems only a reveal
 * (and a poke, which changes no outcome) writes a cell during it, so the board as
 * it stood when the phase began is the board minus the resolving cycle, and it is
 * released with the cycle, all reveals together, rather than in the order players
 * paid for them. The cycle number is the latest's, so the framework can tell when
 * the board has caught up.
 */
import {derived, type Readable} from 'svelte/store';
import type {SubmissionState} from '$lib/game/core/submission';
import {
	heldTurnUntilBoardReleases,
	type HoldResolvingCycle,
} from '$lib/game/core/handover';
import type {BoardState} from './board/indexed-board';
import type {Move} from './moves';
import type {LocalPlan} from './view';
import {sameMoves} from './preview';

export const holdResolvingCycle: HoldResolvingCycle<BoardState> = ({
	shown,
	latest,
}) => ({data: shown.data, cycleNumber: latest.cycleNumber});

/**
 * The player's turn, kept on screen until the board releases the cycle it is in,
 * with what it will do (its preview) as it stood when the hold began.
 *
 * THE PREVIEW IS FROZEN WITH THE TURN. Two things take the live one away during
 * the hold, and either made the turn vanish from the board while it resolved:
 * the submission's `Revealed` carries no moves, so a preview of the moves
 * planned NOW is a preview of nothing; and the preview runs on the indexer's
 * board, not the held one, so the reveals landing (this player's own included)
 * would be drawn into it. When the hold begins (the lock) no reveal of the cycle
 * has landed, so the preview then is the turn on the board it was planned on.
 * A turn with no preview by then (planned at the last moment) is drawn as
 * planned, the ghost in its colour (`render/look.ts`, `stoneColour`), rather
 * than with a preview that could already hold someone else's reveal. So is a
 * turn whose hold this page did not see begin (a reload in the reveal phase):
 * the preview it finds may be run on reveals that have already landed.
 */
export function holdPlanUntilBoardReleases(params: {
	submission: Readable<SubmissionState<Move>>;
	plan: Readable<LocalPlan>;
	holding: Readable<number | undefined>;
}): Readable<LocalPlan> {
	const held = heldTurnUntilBoardReleases({
		submission: params.submission,
		holding: params.holding,
	});
	let frozen: {cycleNumber: number; preview?: LocalPlan['preview']} | undefined;
	// `null` until anything is seen, so a hold found at load did not begin here
	let lastHolding: number | undefined | null = null;
	let beganHere: number | undefined;
	return derived(
		[params.plan, held, params.holding],
		([$plan, $held, $holding]): LocalPlan => {
			if ($holding !== lastHolding) {
				beganHere =
					lastHolding === undefined && $holding !== undefined
						? $holding
						: undefined;
				lastHolding = $holding;
			}
			if ($held === undefined || $holding === undefined) {
				frozen = undefined;
				return $plan;
			}
			const current =
				$plan.preview && sameMoves($held, $plan.planned)
					? $plan.preview
					: undefined;
			if (frozen?.cycleNumber !== $holding) {
				frozen = {
					cycleNumber: $holding,
					preview: beganHere === $holding ? current : undefined,
				};
			}
			return {
				planned: $held,
				player: $plan.player,
				held: true,
				...(frozen.preview ? {preview: frozen.preview} : {}),
			};
		},
	);
}

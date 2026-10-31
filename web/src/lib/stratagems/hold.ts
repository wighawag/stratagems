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

/** The player's turn, kept on screen until the board releases the cycle it is in. */
export function holdPlanUntilBoardReleases(params: {
	submission: Readable<SubmissionState<Move>>;
	plan: Readable<LocalPlan>;
	holding: Readable<number | undefined>;
}): Readable<LocalPlan> {
	const held = heldTurnUntilBoardReleases({
		submission: params.submission,
		holding: params.holding,
	});
	// the plan's preview goes with it when the turn held is the turn planned
	return derived([params.plan, held], ([$plan, $held]): LocalPlan =>
		$held === undefined
			? $plan
			: {
					planned: $held,
					player: $plan.player,
					...($plan.preview && sameMoves($held, $plan.planned)
						? {preview: $plan.preview}
						: {}),
				},
	);
}

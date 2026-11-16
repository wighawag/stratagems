import {describe, it, expect} from 'vitest';
import {get, writable} from 'svelte/store';
import type {SubmissionState} from '$lib/game/core/submission';
import {holdPlanUntilBoardReleases} from '$lib/stratagems/hold';
import type {Move} from '$lib/stratagems/moves';
import type {LocalPlan} from '$lib/stratagems/view';
import type {MovesPreview} from '$lib/stratagems/preview';

const PLAYER = '0x00000000000000000000000000000000000a11ce' as const;
const MOVES: Move[] = [{position: 7n, color: 2}];

function previewOf(life: number): MovesPreview {
	return new Map([
		[
			'7',
			{
				owner: PLAYER,
				cell: {
					lastCycleUpdate: 3,
					cycleWhenTokenIsAdded: 3,
					producingCycles: 0,
					color: 2,
					life,
					delta: 0,
					enemyMap: 0,
					distribution: 0,
					stake: 1,
				},
			},
		],
	]);
}

function setup() {
	const submission = writable<SubmissionState<Move>>({
		step: 'Planning',
		cycleNumber: 3,
		actions: MOVES,
	});
	const plan = writable<LocalPlan>({
		planned: MOVES,
		player: PLAYER,
		preview: previewOf(2),
	});
	const holding = writable<number | undefined>(undefined);
	const shown = holdPlanUntilBoardReleases({submission, plan, holding});
	// subscribed throughout, as the view is
	const stop = shown.subscribe(() => {});
	return {submission, plan, holding, shown, stop};
}

describe('the turn held while its cycle resolves', () => {
	it('keeps its moves AND its preview once revealed, until the board releases the cycle', () => {
		const {submission, plan, holding, shown, stop} = setup();
		submission.set({step: 'Committed', cycleNumber: 3, actions: MOVES});
		holding.set(3);
		// the reveal landed: the submission carries no moves, nor does the plan
		submission.set({step: 'Revealed', cycleNumber: 3});
		plan.set({planned: [], player: PLAYER});
		expect(get(shown).planned).toEqual(MOVES);
		expect(get(shown).preview).toEqual(previewOf(2));
		expect(get(shown).held).toBe(true);
		// the release
		holding.set(undefined);
		expect(get(shown)).toEqual({planned: [], player: PLAYER});
		stop();
	});

	it('keeps the preview from when the hold began, not one run on the board reveals are landing on', () => {
		const {submission, plan, holding, shown, stop} = setup();
		submission.set({step: 'Committed', cycleNumber: 3, actions: MOVES});
		holding.set(3);
		// a reveal changes the indexer's board, so the live preview is run again
		plan.set({planned: MOVES, player: PLAYER, preview: previewOf(5)});
		expect(get(shown).preview).toEqual(previewOf(2));
		stop();
	});

	it('draws the turn without a preview when it had none as the hold began', () => {
		const {submission, plan, holding, shown, stop} = setup();
		plan.set({planned: MOVES, player: PLAYER});
		submission.set({step: 'Committed', cycleNumber: 3, actions: MOVES});
		holding.set(3);
		plan.set({planned: MOVES, player: PLAYER, preview: previewOf(5)});
		expect(get(shown).planned).toEqual(MOVES);
		expect(get(shown).preview).toBeUndefined();
		stop();
	});

	it('freezes each cycle on its own: the next hold takes the preview of its own turn', () => {
		const {submission, plan, holding, shown, stop} = setup();
		submission.set({step: 'Committed', cycleNumber: 3, actions: MOVES});
		holding.set(3);
		submission.set({step: 'Revealed', cycleNumber: 3});
		plan.set({planned: [], player: PLAYER});
		holding.set(undefined);
		// cycle 4: the same cell planned again, its preview run on the new board
		submission.set({step: 'Planning', cycleNumber: 4, actions: MOVES});
		plan.set({planned: MOVES, player: PLAYER, preview: previewOf(4)});
		submission.set({step: 'Committed', cycleNumber: 4, actions: MOVES});
		holding.set(4);
		expect(get(shown).preview).toEqual(previewOf(4));
		stop();
	});

	it('takes no preview for a hold it did not see begin (a reload in the reveal phase)', () => {
		const submission = writable<SubmissionState<Move>>({
			step: 'Committed',
			cycleNumber: 3,
			actions: MOVES,
		});
		// the preview found at load may already be run on reveals that landed
		const plan = writable<LocalPlan>({
			planned: MOVES,
			player: PLAYER,
			preview: previewOf(5),
		});
		const holding = writable<number | undefined>(3);
		const shown = holdPlanUntilBoardReleases({submission, plan, holding});
		const stop = shown.subscribe(() => {});
		expect(get(shown).planned).toEqual(MOVES);
		expect(get(shown).preview).toBeUndefined();
		stop();
	});
});

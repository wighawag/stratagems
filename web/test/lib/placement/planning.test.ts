import {describe, expect, it} from 'vitest';
import {get, writable, type Writable} from 'svelte/store';
import {createPlanning} from '$lib/placement/planning';
import type {Placement} from '$lib/placement/commit-reveal';
import type {SubmissionState, SubmissionStore} from '$lib/game/core/submission';
import type {GameIdentity} from '$lib/game/identity';

/**
 * A TURN THIS CLIENT CANNOT OPEN IS A FORFEITED STAKE, and planning is the only
 * place that can stop one being asked for.
 *
 * A submission longer than one chunk is revealed in several transactions, in
 * order, inside a window that shuts. Chunks that do not land are a missed
 * reveal, which forfeits whatever the game puts at stake - the bond here, the
 * avatar on the identity branches, where it was measured costing four of them
 * in a single harness run. Nothing on chain can refuse the commitment, because
 * at commit time the contract holds a hash and nothing else.
 *
 * WHAT THIS IS NOT is a turn cap. A cap is a rule about what a player may do,
 * it only binds where identity is scarce, and the framework takes no position
 * on it. This is a statement about the window.
 */

function fakeSubmission(): SubmissionStore<GameIdentity, Placement> & {
	state: Writable<SubmissionState<Placement>>;
	ready: Writable<boolean>;
} {
	const state = writable<SubmissionState<Placement>>({
		step: 'Planning',
		actions: [],
	} as unknown as SubmissionState<Placement>);

	const store = {
		subscribe: state.subscribe,
		get value() {
			return get(state);
		},
		plan(actions: readonly Placement[]) {
			state.set({
				step: 'Planning',
				actions: [...actions],
			} as unknown as SubmissionState<Placement>);
		},
		async commit() {},
		async reveal() {},
		dismiss() {},
		adopt: () => false,
		ready: writable(true),
		state,
	};
	return store as unknown as SubmissionStore<GameIdentity, Placement> & {
		state: Writable<SubmissionState<Placement>>;
		ready: Writable<boolean>;
	};
}

function planCells(
	planning: ReturnType<typeof createPlanning>,
	count: number,
): void {
	for (let i = 0; i < count; i++) planning.toggle(BigInt(i + 1));
}

describe('a plan is bounded by what the reveal phase can open', () => {
	it('refuses the placement that would make the turn unopenable', () => {
		const submission = fakeSubmission();
		const planning = createPlanning({submission, maxActions: writable(3)});

		planCells(planning, 5);

		// Two of the five clicks did nothing, and that is the whole feature: the
		// sixth cell would have committed a turn whose last chunk arrives after
		// the phase has shut.
		expect(get(planning.count)).toBe(3);
		expect(get(planning.atLimit)).toBe(true);
	});

	it('still lets a cell be taken back off at the limit', () => {
		const submission = fakeSubmission();
		const planning = createPlanning({submission, maxActions: writable(3)});

		planCells(planning, 3);
		expect(get(planning.count)).toBe(3);

		// REMOVING IS THE WAY OUT. A limit that refused this would trap the
		// player in the state it exists to prevent, and it would do so at exactly
		// the moment they are trying to fix it.
		planning.toggle(2n);
		expect(get(planning.count)).toBe(2);
		expect(get(planning.atLimit)).toBe(false);

		// And a different cell can go on in its place.
		planning.toggle(99n);
		expect(get(planning.count)).toBe(3);
	});

	it('bounds nothing while the chain clock has not measured a block time', () => {
		const submission = fakeSubmission();
		const planning = createPlanning({
			submission,
			maxActions: writable(undefined),
		});

		planCells(planning, 12);

		// A guessed block time would refuse real clicks on the strength of
		// nothing. By the time a commitment can be made the clock has synced,
		// because the same store drives the phase countdown.
		expect(get(planning.count)).toBe(12);
		expect(get(planning.atLimit)).toBe(false);
	});

	it('follows the limit when the chain gets slower or the phase shorter', () => {
		const submission = fakeSubmission();
		const maxActions = writable<number | undefined>(8);
		const planning = createPlanning({submission, maxActions});

		planCells(planning, 6);
		expect(get(planning.atLimit)).toBe(false);

		// Blocks slow down, so fewer chunks fit and a plan that was fine is now
		// over. It is not retroactively trimmed - the player chose those cells -
		// but nothing more goes on and the HUD says so.
		maxActions.set(4);
		expect(get(planning.atLimit)).toBe(true);
		planning.toggle(77n);
		expect(get(planning.count)).toBe(6);
	});

	it('exposes the limit so the HUD can say what it is', () => {
		const submission = fakeSubmission();
		const planning = createPlanning({submission, maxActions: writable(36)});
		expect(get(planning.maxActions)).toBe(36);
	});

	it('takes no plan while the submission cannot take one, and says so through canPlan', () => {
		const submission = fakeSubmission();
		const planning = createPlanning({submission, maxActions: writable(36)});
		submission.ready.set(false);
		expect(get(planning.canPlan)).toBe(false);
		planning.toggle(5n);
		expect(get(planning.count)).toBe(0);
		submission.ready.set(true);
		expect(get(planning.canPlan)).toBe(true);
		planning.toggle(5n);
		expect(get(planning.count)).toBe(1);
	});
});

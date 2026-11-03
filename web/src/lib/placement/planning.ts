/**
 * Turning clicks into a plan.
 *
 * The plan itself lives in the framework's submission (it is what gets hashed,
 * and it has to survive a reload), so this does not keep a second copy. It only
 * translates "the player clicked cell X" into a new list of placements, and
 * exposes that list in the shape the view merge wants.
 *
 * Deliberately plain TypeScript with Svelte stores at the boundary: components
 * import this rather than doing any of it themselves.
 */
import {derived, get, type Readable} from 'svelte/store';
import type {SubmissionState, SubmissionStore} from '$lib/game/core/submission';
import type {GameIdentity} from '$lib/game/identity';
import type {Placement} from './commit-reveal';
import type {LocalPlan} from './view';

/** The plan is only changeable while the submission has not been committed. */
export function isPlannable(state: SubmissionState<Placement>): boolean {
	return (
		state.step === 'Idle' ||
		state.step === 'Planning' ||
		state.step === 'Revealed' ||
		state.step === 'Missed' ||
		(state.step === 'Error' && state.during === 'commit')
	);
}

function plannedCellsOf(state: SubmissionState<Placement>): bigint[] {
	if (!('actions' in state)) return [];
	return state.actions.map((placement) => placement.cellID);
}

export type PlanningStore = {
	/** What the player has planned, for the view merge. */
	plan: Readable<LocalPlan>;
	/**
	 * The same, in the shape the contract is committed to.
	 *
	 * Exposed because recovering a lost submission offers the planned turn as a
	 * CANDIDATE for a commitment the chain already holds, and the component that
	 * offers it must not be the thing that converts cell ids into placements.
	 */
	actions: Readable<readonly Placement[]>;
	/** Whether clicks currently change anything. */
	canPlan: Readable<boolean>;
	/** How many placements are planned (what the submission will cost). */
	count: Readable<number>;
	/**
	 * The most placements this client could still OPEN in one reveal phase, or
	 * `undefined` while the chain clock has not said how fast blocks arrive.
	 *
	 * Not a rule of the game. See {@link createPlanning}.
	 */
	maxActions: Readable<number | undefined>;
	/** True when a further cell would be refused because of the above. */
	atLimit: Readable<boolean>;
	/** Add the cell to the plan, or take it out if it is already there. */
	toggle(cellID: bigint): void;
	clear(): void;
};

/**
 * @param maxActions How many placements this client could open inside one
 * reveal phase, from `game/core/reveal-window.ts`, or `undefined` while that is
 * not yet known.
 *
 * WHY PLANNING IS WHERE THIS IS ENFORCED, and why it is not a turn cap. A
 * submission longer than one chunk is revealed in several transactions, in
 * order, inside a window that shuts; chunks that do not land are a MISSED
 * REVEAL, which forfeits whatever the game puts at stake. Nothing on chain can
 * prevent committing to a turn that cannot be opened, because at commit time
 * the contract is holding a hash. So the only place it can be stopped is before
 * the player asks for it.
 *
 * It is a statement about THIS CLIENT and the chain it is on - how many
 * transactions fit in the time available - and not about what a player may do,
 * which is the game's own business and which the framework deliberately takes
 * no position on. A game that wants a real cap enforces one in its own reveal.
 *
 * `undefined` does not bound anything, deliberately. The limit is only
 * meaningful once the chain clock has measured how fast blocks arrive, and
 * refusing a player's clicks on the strength of a guessed block time would be
 * worse than the hazard: by the time a commitment can be made the clock has
 * synced, because the same store drives the phase countdown.
 */
export function createPlanning(params: {
	submission: SubmissionStore<GameIdentity, Placement>;
	maxActions: Readable<number | undefined>;
}): PlanningStore {
	const {submission, maxActions} = params;

	const plannedStore = derived(submission, ($submission) =>
		plannedCellsOf($submission),
	);

	const plan = derived(plannedStore, ($planned): LocalPlan => ({
		planned: $planned,
	}));

	const actions = derived(plannedStore, ($planned): readonly Placement[] =>
		$planned.map((cellID) => ({cellID})),
	);

	// AND ONLY ONCE THE SUBMISSION CAN TAKE A PLAN: after an account switch the
	// new account's data loads, the submission reads `Idle` meanwhile and drops a
	// plan, so a click then would change nothing (`SubmissionStore.ready`).
	const canPlan = derived(
		[submission, submission.ready],
		([$submission, $ready]) => $ready && isPlannable($submission),
	);

	const count = derived(plannedStore, ($planned) => $planned.length);

	const atLimit = derived(
		[plannedStore, maxActions],
		([$planned, $max]) => $max !== undefined && $planned.length >= $max,
	);

	function toggle(cellID: bigint) {
		if (!get(canPlan)) return;

		const current = plannedCellsOf(submission.value);
		const without = current.filter((id) => id !== cellID);

		if (without.length !== current.length) {
			// Already planned: a second click takes it back off. Toggling matters
			// more here than in a normal UI, because every placement costs stake
			// and a mis-click that could not be undone would cost real tokens.
			//
			// REMOVING IS NEVER REFUSED, including when the plan is over the limit.
			// Taking a cell back off is the move that makes an unopenable turn
			// openable again, so a limit that blocked it would trap the player in
			// exactly the state it exists to prevent.
			submission.plan(without.map((id) => ({cellID: id})));
			return;
		}

		// ADDING IS. A turn whose chunks cannot all land before the reveal phase
		// shuts is a missed reveal, and a missed reveal forfeits the stake - so
		// the click does nothing and the HUD says why. Silently doing nothing
		// would be its own bug; `atLimit` is what the HUD reads to explain it.
		const max = get(maxActions);
		if (max !== undefined && current.length >= max) return;

		submission.plan([...current, cellID].map((id) => ({cellID: id})));
	}

	function clear() {
		if (!isPlannable(submission.value)) return;
		submission.plan([]);
	}

	return {plan, actions, canPlan, count, maxActions, atLimit, toggle, clear};
}

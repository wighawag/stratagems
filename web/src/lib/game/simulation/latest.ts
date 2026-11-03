/**
 * The latest answer to an asynchronous question, as a store.
 *
 * WHY IT EXISTS. The view seam (`$lib/view`, `ViewMerge`) is synchronous: it is
 * called on every change of the board or the plan and returns what to draw. A
 * simulation is not: running the contract's own code in the sandbox is an
 * `eth_call`, which answers later. So a game does not call the sandbox from its
 * merge. It feeds its plan into this store, and its merge reads the last result
 * out of its local state, which is how the seam stays exactly as it is.
 *
 * WHAT IT GUARANTEES, which is the only thing worth having here: a result is
 * published only for the input that is CURRENT when it arrives. Runs finish in
 * any order (a long turn takes longer than a short one), and a preview of the
 * plan the player had a click ago drawn over the plan they have now is worse
 * than no preview: it shows consequences of moves they did not make. So a
 * stale answer is dropped, and while the newest one is on its way the store
 * says `Pending` with no result rather than the previous one.
 *
 * `undefined` as the input means there is nothing to run (no plan, or the
 * board is not loaded yet), and the store is `Idle`.
 */
import {readable, type Readable} from 'svelte/store';

export type LatestResult<I, R> =
	| {step: 'Idle'}
	| {step: 'Pending'; input: I}
	| {step: 'Ready'; input: I; result: R}
	| {step: 'Failed'; input: I; error: unknown};

export function latestResult<I, R>(
	inputs: Readable<I | undefined>,
	run: (input: I) => Promise<R>,
	options: {
		/**
		 * Two inputs that would give the same answer. A store upstream may emit
		 * the same value again (a derived store re-derives whenever any of its
		 * sources does), and without this every such emission runs again.
		 */
		equal?: (a: I, b: I) => boolean;
	} = {},
): Readable<LatestResult<I, R>> {
	const {equal = Object.is} = options;

	return readable<LatestResult<I, R>>({step: 'Idle'}, (set) => {
		// The run each emission started, so an answer can tell whether it is
		// still the latest. A counter rather than the input: two equal inputs a
		// while apart are still two different runs.
		let generation = 0;
		let current: {input: I} | undefined;

		const stop = inputs.subscribe((input) => {
			if (input === undefined) {
				generation++;
				current = undefined;
				set({step: 'Idle'});
				return;
			}
			if (current && equal(current.input, input)) return;

			const mine = ++generation;
			current = {input};
			set({step: 'Pending', input});
			run(input).then(
				(result) => {
					if (mine === generation) set({step: 'Ready', input, result});
				},
				(error: unknown) => {
					if (mine === generation) set({step: 'Failed', input, error});
				},
			);
		});

		return () => {
			// Whatever is still running answers nobody.
			generation++;
			stop();
		};
	});
}

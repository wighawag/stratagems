/**
 * This app's own additions to the trace.
 *
 * The mechanism and everything the template composes for every app are in
 * `$lib/game/core/diagnostics`: the modal candidates, RPC health and its
 * inputs, the signer's balance, the submission and the cycle. Read that file
 * first; it is also where the argument for watching from OUTSIDE rather than
 * instrumenting `core/` lives, and it is the reason a descendant can keep this
 * file without inheriting a merge conflict.
 *
 * WHAT BELONGS HERE is whatever is this game's own. They go on the `submission`
 * namespace beside the submission itself, because the question they answer is
 * always relative to it: "the setup gate opened at +0, the acquisition
 * finished at +4s, the submission committed at +4.2s" is a story, and the same
 * three lines in three namespaces are not.
 *
 * A game built from this template replaces the list below with its own and
 * leaves everything else alone.
 *
 * `Context` is accepted here and NOT upstream, deliberately: `context/types.ts`
 * is one of the files a game replaces, so a framework file that named it could
 * not be inherited by the games it exists for. Upstream describes what it needs
 * structurally instead, and this app's `Context` satisfies it with no cast -
 * which is the check that the structural description is honest.
 */
import {DIAG, startCoreDiagnostics, watch} from '$lib/game/core/diagnostics';
import type {Context} from '$lib/context/types';

export function startDiagnostics(context: Context): () => void {
	const stops = [startCoreDiagnostics(context)];
	const {game} = context;

	stops.push(
		watch(DIAG.submission, game.acquisition, ($acquisition) =>
			$acquisition.step === 'Error'
				? `acquisition: Error ${$acquisition.message}`
				: `acquisition: ${$acquisition.step}`,
		),
	);

	stops.push(
		watch(
			DIAG.submission,
			game.missedReveal,
			($missed) => `missedReveal: ${$missed.step}`,
		),
	);

	// The chain holding a commitment this browser cannot open is the most
	// time-critical state the app has, and it lasts one cycle. Traced beside the
	// submission because the question is always what the submission was doing when
	// it appeared.
	stops.push(
		watch(
			DIAG.submission,
			game.recovery,
			($recovery) => `recovery: ${$recovery.step}`,
		),
	);

	stops.push(
		watch(
			DIAG.submission,
			game.setup,
			($setup) => `setup: ${$setup ? $setup.step : 'ready to play'}`,
		),
	);

	return () => {
		for (const stop of stops) stop();
	};
}

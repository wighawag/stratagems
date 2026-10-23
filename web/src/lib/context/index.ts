/**
 * The app context, composed.
 *
 * Two halves, deliberately in two files, and the shape is INHERITED from
 * jolly-roger rather than invented here:
 *
 * - `./core.ts` is the template's. Connection, executors, balances, transaction
 *   observation, the RPC-health picture. It is merged down from upstream, so
 *   the less it differs the better.
 * - The game's half is the commit-reveal framework wired to one game. It is
 *   what a descendant of this template rewrites, and it is reached through the
 *   `$app-specific` alias (see svelte.config.js), so a game keeps it beside its own
 *   code and points the alias there.
 *
 * The core builds the game rather than the other way round, because the order
 * matters: the game needs the connection, and the health/refresh wiring needs
 * the game's chain reads. See the injection point in `core.ts`.
 */
import {createCoreContext, type ConnectionFactory} from './core.js';
import {createAppContext, SIGNER_GRANT} from '$app-specific';
import type {Context} from './types.js';

export type {
	CoreServices,
	ConnectionFactory,
	ConnectionRequest,
} from './core.js';

/**
 * @param options.establishConnection WHICH WORLD this context describes. Omit
 * it for the app's own remote chain, which is what a single-world app wants and
 * what every route here passes today. An app offering a second world - another
 * network, or an execution-only node in the tab - builds a context per world and
 * hands each one its own factory. See `ConnectionFactory` in `./core.ts`.
 */
export function createContext(options?: {
	establishConnection?: ConnectionFactory;
}): {
	context: Context;
	start: () => () => void;
} {
	// Both of the game's contributions travel the same way, and for the same
	// reason: `core.ts` must not import `game.ts`. The grant is this app's answer
	// to "what is this browser's key for", which two pieces of shared UI need
	// (the payment dialog's consent step and the account panel's delegation row)
	// and neither can work out. See ui/delegation/grant.
	return createCoreContext({
		createApp: createAppContext,
		signerGrant: SIGNER_GRANT,
		establishConnection: options?.establishConnection,
	});
}

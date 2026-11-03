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
import {readable} from 'svelte/store';
import {createCoreContext, type ConnectionFactory} from './core.js';
import * as app from '$app-specific';
import {createAppContext, SIGNER_GRANT} from '$app-specific';
import type {Context} from './types.js';
import type {PlayerIdentity, RevealScheduler} from '$lib/game/core/seams';
import {params} from '$lib';
import {deployments} from '$lib/deployments-store';
import {establishRemoteConnection} from '$lib/core/connection/remote';
import type {DeploymentsStore} from '$lib/core/connection/types';
import {tableFromParam, type TableLobby} from '$lib/game/lobby/table';

/**
 * THE GAME'S TABLES, if it has any: the `lobby` its `$app-specific` module
 * exports. Optional, read off the module rather than imported by name, so a
 * game with no tables declares nothing and compiles unedited.
 */
export const lobby: TableLobby | undefined = (
	app as unknown as {lobby?: TableLobby}
).lobby;

/**
 * The table this page is at: `?game=<address>`, when the game has tables.
 * Read once, as the context is, so moving between tables is a page load.
 */
export function tableOfThisPage(): `0x${string}` | undefined {
	return lobby ? tableFromParam(params.game) : undefined;
}

/** The remote chain, with the game at `table`: the world's records, made the table's by the game. */
function establishTableConnection(
	lobbyOfTheGame: TableLobby,
	table: `0x${string}`,
): ConnectionFactory {
	const records = lobbyOfTheGame.deploymentsAt(deployments.get(), table);
	const store: DeploymentsStore = {
		...readable(records),
		get: () => records,
	};
	return (request) =>
		establishRemoteConnection({...request, deployments: store});
}

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
	/**
	 * Who reveals for this world's players, when the world has someone (a
	 * hotseat world's local revealer): see `CoreServices.scheduler`.
	 */
	scheduler?: RevealScheduler<PlayerIdentity>;
}): {
	context: Context;
	start: () => () => void;
} {
	// Both of the game's contributions travel the same way, and for the same
	// reason: `core.ts` must not import `game.ts`. The grant is this app's answer
	// to "what is this browser's key for", which two pieces of shared UI need
	// (the payment dialog's consent step and the account panel's delegation row)
	// and neither can work out. See ui/delegation/grant.
	// AT A TABLE, the whole page is: one connection and one account's data,
	// with the game at the table's address. A second context beside the app's
	// would be a second connection to the same wallet and a second writer of
	// the same account data.
	const table = options?.establishConnection ? undefined : tableOfThisPage();
	return createCoreContext({
		createApp: createAppContext,
		signerGrant: SIGNER_GRANT,
		establishConnection:
			options?.establishConnection ??
			(table && lobby ? establishTableConnection(lobby, table) : undefined),
		table,
		...(options?.scheduler ? {scheduler: options.scheduler} : {}),
	});
}

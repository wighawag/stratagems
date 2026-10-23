/**
 * THE GAME, AS THE FRAMEWORK SEES IT: everything the framework needs from the
 * game, in one module, reached only through the `$app-specific` alias.
 *
 * Same mechanism as `$ui` (see svelte.config.js): the framework imports
 * `$app-specific`, never `$lib/placement`, so a game that is not this one points
 * the alias at its own module and the framework compiles against that instead,
 * without a framework file being edited. A game supplies exactly what this file
 * exports. The names are jolly-roger's (`createAppContext`, `AppMembers`), the
 * template's own additions are `startDiagnostics`, and the two contract choices
 * are the same as upstream's.
 *
 * The two contract choices are FUNCTIONS OF THE TYPED DEPLOYMENTS and not
 * names, so naming a contract the deployment does not have is a compile error
 * here, in the game, rather than a string the framework looks up and gets
 * `undefined` for. Only an address crosses into the framework: what is called
 * on the delegation registry is typed by `DELEGATION_ABI`, which is the
 * delegation surface whichever contract implements it.
 */
import type {TypedDeployments} from '$lib/deployments-store';
import type {GameContext} from './context';

export {createGameContext as createAppContext, SIGNER_GRANT} from './context';

/**
 * What this game adds to the app context: every member of `GameContext`
 * except its lifecycle. `$lib/context/types` adds this to `Context`, so the
 * framework names no game type.
 */
export type AppMembers = Omit<GameContext, 'start'>;

/** What `?debug` traces, on top of the framework's own. */
export {startDiagnostics} from './diagnostics';

/**
 * The contract that records who may act for whom (`UsingDelegation`). In this
 * game the Game is the registry.
 */
export function delegationRegistry(
	deployments: TypedDeployments,
): `0x${string}` {
	return deployments.contracts.Game.address;
}

/**
 * The contract whose address scopes this browser's local operation records.
 * One whose address is stable for the deployment's lifetime (a proxy, not an
 * implementation).
 */
export function operationScope(deployments: TypedDeployments): `0x${string}` {
	return deployments.contracts.Game.address;
}

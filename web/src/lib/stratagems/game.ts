/**
 * STRATAGEMS, AS THE FRAMEWORK SEES IT: the module the `$app-specific` alias
 * points at (svelte.config.js), exporting the names the template's own game
 * module (`src/lib/placement/game.ts`, omitted here) exports. The framework
 * reaches the game only through this file.
 *
 * The composition is `./context.ts` (step 6b of
 * work/plans/join-template-commit-reveal.md): stratagems on the template's
 * commit-reveal skeleton and its base's client.
 */
import type {TypedDeployments} from '$lib/deployments-store';
import type {GameContext} from './context';

export {createGameContext as createAppContext, SIGNER_GRANT} from './context';

/**
 * What this game adds to the app context: every member of `GameContext` except
 * its lifecycle. `$lib/context/types` adds this to `Context`.
 */
export type AppMembers = Omit<GameContext, 'start'>;

/** What `?debug` traces, on top of the framework's own. */
export {startDiagnostics} from './diagnostics';

/**
 * The contract that records who may act for whom (`UsingDelegation`): the
 * Stratagems router, through its `StratagemsDelegation` route.
 */
export function delegationRegistry(
	deployments: TypedDeployments,
): `0x${string}` {
	return deployments.contracts.Stratagems.address;
}

/**
 * The contract whose address scopes this browser's local operation records: the
 * Stratagems proxy, whose address is stable for the deployment's lifetime.
 */
export function operationScope(deployments: TypedDeployments): `0x${string}` {
	return deployments.contracts.Stratagems.address;
}

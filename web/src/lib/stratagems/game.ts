/**
 * STRATAGEMS, AS THE TEMPLATE'S FRAMEWORK SEES IT: the module the `$app-specific`
 * alias points at (svelte.config.js), exporting the names the template's own
 * game module (`src/lib/placement/game.ts`, omitted here) exports.
 *
 * A PLACEHOLDER UNTIL THE PORT, and it says so in every member. stratagems'
 * shell (`src/routes/+layout.svelte`) does not mount the template's app context
 * yet, so nothing here runs: it exists so the framework COMPILES against
 * stratagems instead of against the reference game, which is what this repo
 * checks on every cascade (the template's plan: a compile-only member, "a cascade
 * that breaks stratagems' build has found something").
 *
 * Step 6 of `work/plans/join-template-commit-reveal.md` (the app context and the
 * connection) replaces it with stratagems' real composition. Until then:
 *
 * - `onchainState` is the one member core consumes (`AppContext` in
 *   `$lib/context/core`), with nothing behind it;
 * - there is no submission, so `startDiagnostics` traces nothing;
 * - the two contract choices name `Stratagems`, which compiles against the
 *   committed alpha1 records but is NOT a delegation registry: alpha1 has no
 *   `UsingDelegation`. It gets one when step 10b rebuilds the contracts on the
 *   template's commit-reveal base, so step 6 cannot mount this before that.
 */
import {readable} from 'svelte/store';
import type {TypedDeployments} from '$lib/deployments-store';
import type {CoreServices} from '$lib/context/core';
import type {Context} from '$lib/context/types';
import type {PollingStatus} from '$lib/core/connection/polling-store';
import type {SignerGrant} from '$lib/ui/delegation/grant';

type StratagemsApp = {
	onchainState: {
		update: () => Promise<unknown>;
		status: ReturnType<typeof readable<PollingStatus>>;
	};
};

/** What stratagems adds to the app context: nothing yet but what core reads. */
export type AppMembers = StratagemsApp;

/** Never called before step 6 (see the header). */
export function createAppContext(_core: CoreServices): StratagemsApp {
	return {
		onchainState: {
			update: async () => undefined,
			status: readable<PollingStatus>({loading: false}),
		},
	};
}

/** What the browser-held key is for, in the consent text. */
export const SIGNER_GRANT: SignerGrant = {action: 'play your moves'};

/** Nothing of stratagems' to trace before the port. */
export function startDiagnostics(_context: Context): () => void {
	return () => {};
}

/**
 * The contract that records who may act for whom. A placeholder: alpha1's
 * `Stratagems` is not one (see the header).
 */
export function delegationRegistry(deployments: TypedDeployments): `0x${string}` {
	return deployments.contracts.Stratagems.address;
}

/** The contract whose address scopes this browser's local operation records. */
export function operationScope(deployments: TypedDeployments): `0x${string}` {
	return deployments.contracts.Stratagems.address;
}

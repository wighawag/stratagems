/**
 * A game that is NOT the reference game: no board, no placement, and no
 * contract called `Game`. If the framework compiles against this, the seam
 * holds. Nothing here is meant to run.
 */
import {writable} from 'svelte/store';
import type {CoreServices} from '$lib/context/core';
import type {TypedDeployments} from '$lib/core/connection/types';
import type {PollingStatus} from '$lib/core/connection/polling-store';
import type {SignerGrant} from '$lib/ui/delegation/grant';

export const SIGNER_GRANT: SignerGrant = {action: 'play the stub'};

function createStubState() {
	const {subscribe} = writable<{step: 'Unloaded'}>({step: 'Unloaded'});
	const status = writable<PollingStatus>(undefined as unknown as PollingStatus);
	return {subscribe, update: async () => {}, status};
}

export type GameMembers = {onchainState: ReturnType<typeof createStubState>};

export function createGameContext(_core: CoreServices): GameMembers & {start(): () => void} {
	return {onchainState: createStubState(), start: () => () => {}};
}

export function delegationRegistry(d: TypedDeployments): `0x${string}` {
	return d.contracts.Stub.address;
}

export function operationScope(d: TypedDeployments): `0x${string}` {
	return d.contracts.Stub.address;
}

/** Not on the commit-reveal framework yet, so it has none of its diagnostics. */
export function startDiagnostics(_context: unknown): () => void {
	return () => {};
}

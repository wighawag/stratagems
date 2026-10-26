/**
 * What this game puts at stake: tokens in the base's reserve.
 *
 * The reserve is the base's (`$lib/game/core/commit-reveal/reserve`): every
 * game on it bonds from `getReserve` and withdraws with `withdrawFromReserve`.
 * This file only says which contract and which token. A game that gates
 * differently (holding custody of an item the player bought, say) replaces
 * this file with a store of the same shape; the framework only requires that
 * SOMETHING is lost.
 */
import {get} from 'svelte/store';
import {
	createReserve as createBaseReserve,
	type ReserveDeps,
	type ReserveStore,
} from '$lib/game/core/commit-reveal/reserve';
import {onchainIdentity, type ActiveIdentityStore} from '$lib/game/identity';
import type {PlacementConfig} from './config';
import {gameContract} from './commit-reveal';

export type {
	ReserveDeps,
	ReserveState,
	ReserveStore,
} from '$lib/game/core/commit-reveal/reserve';

export function createReserve(params: {
	deps: ReserveDeps;
	config: PlacementConfig;
	/**
	 * WHO PLAYS, and so whose reserve this is: the identity and not the
	 * account, though they hold the same value in this game.
	 */
	identity: ActiveIdentityStore;
}): ReserveStore {
	const {deps, config} = params;
	return createBaseReserve({
		deps,
		// Deployments are fixed for the life of the app.
		contract: gameContract(get(deps.deployments)),
		tokenAddress: config.tokenAddress,
		onchainIdentity,
		identity: params.identity,
	});
}

/**
 * A commitment the player never revealed: the base's settlement, given this
 * game's action and penalty.
 *
 * Reading it, and settling it shown the chunks or without them, is the same in
 * every game on the base, so it is the framework's
 * (`$lib/game/core/commit-reveal/missed-reveal`). What this game decides is
 * what a missed placement costs when the chunks are shown: what it would have
 * cost to reveal, which is what `UsingGameInternal` forfeits.
 */
import type {Readable} from 'svelte/store';
import {
	createMissedReveal as createBaseMissedReveal,
	type MissedRevealDeps,
	type MissedRevealStore,
} from '$lib/game/core/commit-reveal/missed-reveal';
import type {PersistedSubmission} from '$lib/game/core/submission';
import {onchainIdentity, type GameIdentity} from '$lib/game/identity';
import {costOfPlacements, type PlacementConfig} from './config';
import {
	gameContract,
	PLACEMENT_ENCODING,
	type Placement,
} from './commit-reveal';

export {
	blocksCommitting,
	type MissedRevealDeps,
	type MissedRevealState,
	type MissedRevealStore,
} from '$lib/game/core/commit-reveal/missed-reveal';

export function createMissedReveal(params: {
	deps: MissedRevealDeps;
	config: PlacementConfig;
	/** WHO PLAYS, and so whose commitment this is. */
	identity: Readable<GameIdentity | undefined>;
	/**
	 * What is stored of the turn a player committed in a cycle (one record or
	 * several); the chain's head decides which, if any, is the turn. Absent,
	 * every settlement goes without the chunks.
	 */
	committedTurn?: (
		player: GameIdentity,
		cycleNumber: number,
	) =>
		| PersistedSubmission<Placement>
		| readonly PersistedSubmission<Placement>[]
		| undefined;
	/** Called once a forfeit settles: whose turn of which cycle it closed. */
	onSettled?: (settled: {player: GameIdentity; cycleNumber: number}) => void;
}): MissedRevealStore {
	const {deps, config} = params;
	return createBaseMissedReveal<GameIdentity, Placement>({
		deps,
		// Deployments are fixed for the life of the app.
		contract: gameContract(deps.deployments.get()),
		encoding: PLACEMENT_ENCODING,
		onchainIdentity,
		actionsPerReveal: config.actionsPerReveal,
		penaltyFor: (count) => costOfPlacements(config, count),
		identity: params.identity,
		committedTurn: params.committedTurn,
		onSettled: params.onSettled,
	});
}

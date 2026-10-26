/**
 * The template game's `CommitRevealAdapter`: the base's client, given this
 * game's action.
 *
 * The framework's submission decides WHEN these are called and keeps the secret
 * between the two; the translation into the base's calls is the framework's
 * too (`$lib/game/core/commit-reveal/`), because every game on the base makes
 * the same ones. What is left here is this game's part: what a placement is to
 * the contract, which contract, and what to bond.
 */
import {get} from 'svelte/store';
import type {TypedDeployments} from '$lib/core/connection/types';
import type {CommitRevealAdapter} from '$lib/game/core/seams';
import {
	buildChainedCommitment,
	buildCommitmentChain,
	type CommitmentChunk,
} from '$lib/game/core/commit-reveal/chain';
import type {
	ActionEncoding,
	CommitRevealContract,
} from '$lib/game/core/commit-reveal/contract';
import {createCommitRevealContractAdapter} from '$lib/game/core/commit-reveal/adapter';
import type {MoveDeps} from '$lib/game/core/commit-reveal/send';
import {onchainIdentity, type GameIdentity} from '$lib/game/identity';
import {bondFor, type PlacementConfig} from './config';

/** One placement, matching the contract's `Placement` struct. */
export type Placement = {cellID: bigint};

/**
 * A placement, to the contract: the components of `Placement` in `reveal`.
 *
 * It must match `UsingGameInternal`'s digest exactly - same types, same
 * order. A mismatch is not a compile error and not a failed read: the commit
 * succeeds, and the reveal reverts with `CommitmentHashNotMatching` once the
 * player's stake is already bonded. `contracts/test/js/Game.test.ts` computes
 * the hash the same way from the other side.
 */
export const PLACEMENT_ENCODING: ActionEncoding = {
	components: [{name: 'cellID', type: 'uint64'}],
};

/** One reveal transaction's worth of a turn. */
export type PlacementChunk = CommitmentChunk<Placement>;

/** The game contract, which inherits the commit-reveal base. */
export function gameContract(
	deployments: TypedDeployments,
): CommitRevealContract {
	return deployments.contracts.Game;
}

/**
 * The hash chain a turn of placements is committed as. See
 * `$lib/game/core/commit-reveal/chain` for why it is a chain.
 */
export function buildPlacementChain(params: {
	actions: readonly Placement[];
	secret: `0x${string}`;
	actionsPerReveal: number;
}): PlacementChunk[] {
	return buildCommitmentChain({...params, encoding: PLACEMENT_ENCODING});
}

/** The commitment for a whole turn: the head of its chain. */
export function buildPlacementCommitment(params: {
	actions: readonly Placement[];
	secret: `0x${string}`;
	actionsPerReveal: number;
}): {hash: `0x${string}`; encoded: `0x${string}`} {
	return buildChainedCommitment({...params, encoding: PLACEMENT_ENCODING});
}

/**
 * What the adapter needs.
 *
 * `signerExecutor`, NOT `accountExecutor`: commit and reveal are signed by the
 * local signer so the player is never prompted mid-submission. See
 * `MoveDeps` in `$lib/game/core/commit-reveal/send`.
 */
export type CommitRevealDeps = MoveDeps;

export function createPlacementCommitReveal(params: {
	deps: CommitRevealDeps;
	config: PlacementConfig;
	/** See `beforeCommit` in `$lib/game/core/commit-reveal/adapter`. */
	beforeCommit?: () => Promise<void>;
}): CommitRevealAdapter<GameIdentity, Placement> {
	const {deps, config} = params;
	return createCommitRevealContractAdapter<GameIdentity, Placement>({
		deps,
		// Deployments are fixed for the life of the app.
		contract: gameContract(get(deps.deployments)),
		encoding: PLACEMENT_ENCODING,
		// `onchainIdentity` and not the identity itself: how this game's identity
		// is spelled in a contract argument is the one thing `$lib/game/identity`
		// knows and this file must not.
		onchainIdentity,
		actionsPerReveal: config.actionsPerReveal,
		gas: config.gas,
		revealPhaseDuration: config.cycle.revealPhaseDuration,
		// A WHOLE NUMBER OF CHUNKS, NOT THE EXACT COST: the bond is public, so
		// the exact cost would tell any observer how many placements the
		// commitment hides. The surplus is not at risk: the last reveal releases
		// it, and a missed reveal settled WITH the chunks forfeits only what the
		// placements would have cost (see `missed-reveal.ts`).
		bondFor: (actions, reserve) => bondFor(config, actions.length, reserve),
		beforeCommit: params.beforeCommit,
	});
}

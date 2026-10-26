/**
 * Stratagems' action, as the commit-reveal base's client sees it: a move, the
 * contract it is sent to, and the commitment a turn of moves is hashed into.
 *
 * Everything that is the same in every game on the base (the chain of chunks,
 * the commit with its bond, the chunked reveal, the settlements, the storage) is
 * the framework's, in `$lib/game/core/commit-reveal/`; this file says only what
 * a move is to the contract. The reference game's `placement/commit-reveal.ts`
 * is the same file for its own action.
 */
import {get} from 'svelte/store';
import type {TypedDeployments} from '$lib/core/connection/types';
import type {CommitRevealAdapter} from '$lib/game/core/seams';
import {buildChainedCommitment} from '$lib/game/core/commit-reveal/chain';
import type {
	ActionEncoding,
	CommitRevealContract,
} from '$lib/game/core/commit-reveal/contract';
import {createCommitRevealContractAdapter} from '$lib/game/core/commit-reveal/adapter';
import type {MoveDeps} from '$lib/game/core/commit-reveal/send';
import {onchainIdentity, type GameIdentity} from '$lib/game/identity';
import {bondFor, type StratagemsConfig} from './game-config';

/**
 * One move, matching the contract's `Move` struct: a cell (`position`, the
 * packed x,y of `stratagems-common`'s `xyToBigIntID`) and a colour
 * (`Color.None` removes the player's own cell).
 */
export type Move = {position: bigint; color: number};

/**
 * A move, to the contract: the components of `Move` in `reveal`.
 *
 * It must match `UsingStratagemsSetters`' digest exactly (and `common/`'s
 * `prepareCommitment`, which the contract tests hash with): a mismatch is not a
 * compile error, it is a reveal that reverts with `CommitmentHashNotMatching`
 * once the bond is already committed.
 */
export const MOVE_ENCODING: ActionEncoding = {
	components: [
		{name: 'position', type: 'uint64'},
		{name: 'color', type: 'uint8'},
	],
};

/** The game contract, which inherits the commit-reveal base. */
export function gameContract(
	deployments: TypedDeployments,
): CommitRevealContract {
	return deployments.contracts.Stratagems;
}

/** The commitment for a whole turn: the head of its chain. */
export function buildMovesCommitment(params: {
	actions: readonly Move[];
	secret: `0x${string}`;
	actionsPerReveal: number;
}): {hash: `0x${string}`; encoded: `0x${string}`} {
	return buildChainedCommitment({...params, encoding: MOVE_ENCODING});
}

/**
 * The adapter the submission commits and reveals through. `signerExecutor`, so
 * the player is never prompted mid-submission: the browser's key sends the
 * moves, for the account, through `StratagemsDelegation`.
 */
export function createStratagemsCommitReveal(params: {
	deps: MoveDeps;
	config: StratagemsConfig;
	beforeCommit?: () => Promise<void>;
}): CommitRevealAdapter<GameIdentity, Move> {
	const {deps, config} = params;
	return createCommitRevealContractAdapter<GameIdentity, Move>({
		deps,
		contract: gameContract(get(deps.deployments)),
		encoding: MOVE_ENCODING,
		onchainIdentity,
		actionsPerReveal: config.actionsPerReveal,
		gas: config.gas,
		revealPhaseDuration: config.cycle.revealPhaseDuration,
		bondFor: (actions, reserve) => bondFor(config, actions.length, reserve),
		beforeCommit: params.beforeCommit,
	});
}

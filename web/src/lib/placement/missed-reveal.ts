/**
 * A commitment the player never revealed.
 *
 * The contract keeps one open commitment per player. If a reveal phase passes
 * without one, that commitment stays on the books and every later
 * `makeCommitment` reverts with `PreviousCommitmentNotRevealed`. Nothing
 * resolves it on its own, so a player who misses a single reveal - closes the
 * tab at the wrong moment, loses their connection - is locked out of the game
 * until it is settled.
 *
 * SETTLING FORFEITS, so it is the player's to press. There are two ways, and
 * this file picks the cheaper one it can. Shown the CHUNKS
 * (`acknowledgeMissedReveal`, one call per chunk still owed), the contract
 * forfeits only what the placements would have cost and gives back the rest of
 * the bond, which the client rounds up to whole chunks to hide the turn's
 * length. Without them (`forfeitMissedReveal`, the player or their signer only)
 * the whole remaining bond goes. The chunks come from the committed turn
 * `storage.ts` keeps aside, matched against the head the chain is holding.
 *
 * This was briefly done automatically, as a quiet fix-up at the start of the
 * next commit. That was wrong in two ways at once: it spent the player's money
 * inside a transaction they thought was about something else, and it meant they
 * were never told they had missed a reveal or what it had cost them. Losing a
 * stake is the single most important thing this app can have to say to someone.
 * So it is surfaced, explained, and waits for a deliberate press.
 *
 * The chain is the authority here, not the local submission: clearing site data
 * or playing from another browser loses the local memory of the submission,
 * while the contract still holds the commitment.
 *
 * ONE READ, TWO QUESTIONS, and the second one used to be thrown away. Asking
 * `getCommitment` answers "am I blocked?" - a commitment left over from an
 * EARLIER cycle - and it equally answers "is there a commitment for the cycle
 * in progress that this browser knows nothing about?". That second answer is
 * the one that costs the stake, and it was being reported as `Clear` and
 * dropped, because blocking was the only thing anyone had ever asked. It is
 * published as {@link MissedRevealStore.commitment} now and
 * `$lib/game/core/recovery` is what does something with it. Nothing extra is
 * fetched.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import type {Context} from '$lib/context/types';
import {
	onchainIdentity,
	type ActiveIdentityStore,
	type GameIdentity,
} from '$lib/game/identity';
import {costOfPlacements, type PlacementConfig} from './config';
import {
	buildPlacementChain,
	chunkDueNext,
	sendPlacementTransaction,
	type Placement,
	type PlacementChunk,
} from './commit-reveal';
import type {PersistedSubmission} from '$lib/game/core/submission';
import type {LiveCommitment} from '$lib/game/core/recovery';

export type MissedRevealState =
	/** Not checked yet, or nobody connected. */
	| {step: 'Unknown'}
	/** No open commitment from a past cycle: the player is free to commit. */
	| {step: 'Clear'}
	/**
	 * An unrevealed commitment is blocking play. Settling it is what frees the
	 * player to commit again; `forfeit` is what settling will cost, which is
	 * the whole `bond` unless this browser still has the turn's chunks.
	 */
	| ({step: 'Blocked'} & Blocked)
	| ({step: 'Acknowledging'} & Blocked)
	| ({step: 'Failed'; message: string} & Blocked);

type Blocked = {cycleNumber: number; bond: bigint; forfeit: bigint};

export type MissedRevealStore = Readable<MissedRevealState> & {
	readonly value: MissedRevealState;
	/** Re-read the chain. Cheap: one call, plus one more only if blocked. */
	check(): Promise<void>;
	/** Settle the missed reveal and free the player to commit again. */
	acknowledge(): Promise<void>;
	/**
	 * The commitment the contract holds for the cycle NOW IN PROGRESS, if any.
	 *
	 * It blocks nothing, which is why the state above says `Clear` beside it.
	 * What it does is say that a reveal is owed this cycle, whatever this
	 * browser happens to remember, and `$lib/game/core/recovery` is what acts
	 * on that.
	 *
	 * Undefined whenever the read has not happened, failed, or found nothing:
	 * an absent answer is never evidence that no commitment exists.
	 */
	commitment: Readable<LiveCommitment | undefined>;
};

// `signerBalance` because the forfeit goes out through the same `send()` funnel
// as a move, and is signed by the same signer: it must refuse for the same
// reason and would otherwise wedge the account the same way.
export type MissedRevealDeps = Pick<
	Context,
	| 'connection'
	| 'signerExecutor'
	| 'deployments'
	| 'publicClient'
	| 'signerBalance'
>;

export function createMissedReveal(params: {
	deps: MissedRevealDeps;
	config: PlacementConfig;
	/** WHO PLAYS, and so whose commitment this is. */
	identity: ActiveIdentityStore;
	/**
	 * The last turn this browser committed for a player, if it still has it.
	 * Absent, every settlement goes without the chunks.
	 */
	committedTurn?: (
		player: GameIdentity,
	) => PersistedSubmission<Placement> | undefined;
	/** Called once a forfeit settles, so the reserve can be re-read. */
	onSettled?: () => void;
}): MissedRevealStore {
	const {deps, config} = params;

	/** The chunks still owed on the head the chain holds, with their secret. */
	let owed: {chunks: PlacementChunk[]; secret: `0x${string}`} | undefined;

	/**
	 * The chunks of the committed turn the chain is still holding, from the
	 * head on, or undefined when this browser cannot reproduce that head.
	 * THE CHAIN JUDGES, not the record: a record from another turn, another
	 * chunk size or another secret simply matches no head.
	 */
	function chunksStillOwed(
		player: GameIdentity,
		onChain: {hash: `0x${string}`; cycleNumber: bigint},
	): typeof owed {
		const turn = params.committedTurn?.(player);
		if (!turn || BigInt(turn.cycleNumber) !== onChain.cycleNumber) {
			return undefined;
		}
		const chain = buildPlacementChain({
			actions: turn.actions,
			secret: turn.secret,
			actionsPerReveal: config.actionsPerReveal,
		});
		const from = chunkDueNext(chain, onChain.hash);
		if (from === undefined) return undefined;
		return {chunks: chain.slice(from), secret: turn.secret};
	}

	let $state: MissedRevealState = {step: 'Unknown'};
	const store = writable<MissedRevealState>($state);
	const commitment = writable<LiveCommitment | undefined>(undefined);

	function set(next: MissedRevealState) {
		$state = next;
		store.set(next);
	}

	async function check() {
		const player = get(params.identity);
		// `=== undefined`, not falsy: an identity that is a token id can be `0n`.
		if (player === undefined) {
			set({step: 'Unknown'});
			return;
		}
		const deployments = deps.deployments.get();

		try {
			const onChain = (await deps.publicClient.readContract({
				address: deployments.contracts.Game.address,
				abi: deployments.contracts.Game.abi,
				functionName: 'getCommitment',
				args: [onchainIdentity(player)],
			})) as {hash: `0x${string}`; cycleNumber: bigint; bond: bigint};

			if (onChain.cycleNumber === 0n) {
				commitment.set(undefined);
				set({step: 'Clear'});
				return;
			}

			const [currentCycleNumber] = (await deps.publicClient.readContract({
				address: deployments.contracts.Game.address,
				abi: deployments.contracts.Game.abi,
				functionName: 'getCycleNumber',
			})) as [bigint, boolean];

			// A commitment for the CURRENT cycle is live, not missed: it can still
			// be revealed, the contract lets it be replaced, and acknowledging it
			// would revert with `CanStillReveal`. It is still worth SAYING, because
			// a reveal is owed for it and this browser may have no idea: publishing
			// it here is the whole of the chain half of recovering a lost submission.
			if (onChain.cycleNumber === currentCycleNumber) {
				commitment.set({
					cycleNumber: Number(onChain.cycleNumber),
					hash: onChain.hash,
				});
				set({step: 'Clear'});
				return;
			}

			commitment.set(undefined);
			owed = chunksStillOwed(player, onChain);
			const penalty = owed
				? costOfPlacements(
						config,
						owed.chunks.reduce((n, chunk) => n + chunk.actions.length, 0),
					)
				: onChain.bond;
			set({
				step: 'Blocked',
				cycleNumber: Number(onChain.cycleNumber),
				bond: onChain.bond,
				forfeit: penalty < onChain.bond ? penalty : onChain.bond,
			});
		} catch {
			// A failed read is not evidence of anything. Leaving the last known
			// state alone is better than telling someone they have lost a stake
			// because one RPC call did not come back.
		}
	}

	async function acknowledge() {
		if ($state.step !== 'Blocked' && $state.step !== 'Failed') return;
		const {cycleNumber, bond, forfeit} = $state;

		const player = get(params.identity);
		if (player === undefined) return;

		await deps.connection.ensureConnected();
		const executor = get(deps.signerExecutor);
		if (executor.status !== 'ready') return;

		set({step: 'Acknowledging', cycleNumber, bond, forfeit});
		const game = deps.deployments.get().contracts.Game;
		try {
			// Sent by the signer, like every other move, so no spending modal.
			if (owed) {
				// SHOWN THE CHUNKS, in order, from wherever the head got to: each
				// call opens the next one exactly as a reveal would, and the last
				// gives back what the bond held beyond the turn's cost.
				for (const chunk of owed.chunks) {
					await sendPlacementTransaction(
						deps,
						executor,
						{
							address: game.address,
							abi: game.abi,
							functionName: 'acknowledgeMissedReveal',
							args: [
								onchainIdentity(player),
								chunk.actions as {cellID: bigint}[],
								owed.secret,
								chunk.furtherActions,
							],
							account: executor.account,
							chain: null,
						},
						'Acknowledging the missed reveal',
					);
				}
			} else {
				// WITHOUT THEM the whole bond goes, and only the player (or the
				// signer acting for them, as here) may choose that.
				await sendPlacementTransaction(
					deps,
					executor,
					{
						address: game.address,
						abi: game.abi,
						functionName: 'forfeitMissedReveal',
						args: [onchainIdentity(player)],
						account: executor.account,
						chain: null,
					},
					'Acknowledging the missed reveal',
				);
			}
			owed = undefined;
			commitment.set(undefined);
			set({step: 'Clear'});
			params.onSettled?.();
		} catch (error) {
			set({
				step: 'Failed',
				cycleNumber,
				bond,
				forfeit,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return {
		get value() {
			return $state;
		},
		subscribe: store.subscribe,
		check,
		acknowledge,
		commitment: {subscribe: commitment.subscribe},
	};
}

/** Whether an unrevealed commitment is currently preventing a new one. */
export function blocksCommitting(state: MissedRevealState): boolean {
	return (
		state.step === 'Blocked' ||
		state.step === 'Acknowledging' ||
		state.step === 'Failed'
	);
}

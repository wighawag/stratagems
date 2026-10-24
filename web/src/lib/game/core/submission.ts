/**
 * The commit-reveal submission.
 *
 * This is framework, not a seam. It owns the part every game on this template
 * shares: what the player has planned for this cycle, when that stops being
 * changeable, keeping the secret until it is time to disclose it, and getting
 * the reveal out. What it does NOT know is how to call the contract - that is
 * the `CommitRevealAdapter` the game supplies.
 *
 * Two things here are load-bearing rather than convenient.
 *
 * **The reveal is driven, not offered.** A missed reveal costs the player
 * whatever the game put at stake, and the reveal phase can be seconds long. A
 * UI that merely enables a button and hopes the player is watching would take
 * that for a mistake the machine could have avoided. So entering the reveal
 * phase with a live commitment sends the reveal, unless the game has arranged
 * for something else to (see `autoReveal`).
 *
 * What "at stake" means is the GAME's business, and it varies more than a
 * bonded token: this template forfeits a token bond, stratagems burns reserve,
 * and conquest and catacombs intend to dock levels from a character the player
 * paid for, which degrades their position rather than taking a deposit. The
 * framework only needs it to be true that not revealing costs something.
 *
 * **The secret is persisted before the commitment is sent, not after.** It is
 * the only thing that can open the commitment; if a reload can lose it, the
 * player is guaranteed to forfeit, and the window where that is possible is
 * exactly the moment the tab is busiest. Writing it first means the worst case
 * is a stored secret for a commitment that never landed, which is harmless.
 */
import {get, writable, type Readable} from 'svelte/store';
import type {CommitRevealAdapter, PlayerIdentity} from './seams';
import {revealPhaseStartTime, type CycleInfoStore} from './cycle';

/**
 * What has to survive a reload.
 *
 * Kept deliberately small and JSON-shaped: it is written to whatever storage
 * the game hands over, in the middle of a phase, and anything clever here is a
 * way to lose a secret.
 */
export type PersistedSubmission<TAction> = {
	cycleNumber: number;
	actions: readonly TAction[];
	secret: `0x${string}`;
	/** Set once the commit transaction has been submitted. */
	committed: boolean;
};

/**
 * Where the pending submission is kept between page loads.
 *
 * A port rather than a direct `localStorage` call: the submission is
 * constructed during SSR too, and a game with an account system may want the
 * submission scoped to the signed-in player rather than to the browser.
 */
export type SubmissionStorage<TAction> = {
	load(): PersistedSubmission<TAction> | undefined;
	save(submission: PersistedSubmission<TAction>): void;
	clear(): void;
};

export type SubmissionState<TAction> =
	/** No player, or nothing planned yet this cycle. */
	| {step: 'Idle'}
	/** Actions chosen, still changeable. */
	| {step: 'Planning'; cycleNumber: number; actions: readonly TAction[]}
	| {step: 'Committing'; cycleNumber: number; actions: readonly TAction[]}
	/** The commitment is in; the reveal is owed this cycle. */
	| {step: 'Committed'; cycleNumber: number; actions: readonly TAction[]}
	| {
			step: 'Revealing';
			cycleNumber: number;
			actions: readonly TAction[];
			/**
			 * How far a reveal that takes several transactions has got.
			 *
			 * OPTIONAL BECAUSE MOST REVEALS ARE ONE TRANSACTION, and a game whose
			 * turns always fit in one never reports it. Where a turn is bigger
			 * than a transaction the reveal is a SEQUENCE - the commitment is the
			 * head of a hash chain and each transaction opens one piece of it -
			 * and a player watching a board that fills in a few cells at a time
			 * over half a minute is owed an account of what is happening.
			 *
			 * `done` counts pieces that have LANDED, so it starts at whatever the
			 * chain had already accepted (which is not always zero: a reveal
			 * resumed after a reload starts part way through).
			 */
			progress?: {done: number; total: number};
	  }
	| {step: 'Revealed'; cycleNumber: number}
	/**
	 * A commitment from an earlier cycle was never revealed. Whatever the game
	 * put at stake has been lost by its own rules (a burnt bond, a demoted
	 * character); the submission cannot undo it, only report it.
	 */
	| {step: 'Missed'; cycleNumber: number}
	| {
			step: 'Error';
			cycleNumber: number;
			during: 'commit' | 'reveal';
			message: string;
			/**
			 * What actually failed, not just how it reads.
			 *
			 * Carried so a game can tell one failure from another and offer the
			 * matching remedy - a signer with no gas can be topped up and the move
			 * retried, a reverted commitment cannot. Classifying by matching on
			 * `message` would work until someone reworded it.
			 */
			error: unknown;
			actions: readonly TAction[];
	  };

export type SubmissionStore<
	TIdentity extends PlayerIdentity,
	TAction,
> = Readable<SubmissionState<TAction>> & {
	readonly value: SubmissionState<TAction>;
	/** Replace what is planned for this cycle. Ignored once committed. */
	plan(actions: readonly TAction[]): void;
	/** Send the commitment now, rather than waiting for the phase to close. */
	commit(): Promise<void>;
	/** Send the reveal now. Normally the submission does this itself. */
	reveal(): Promise<void>;
	/** Acknowledge a missed reveal, clearing it off the HUD. */
	dismiss(): void;
	/**
	 * Take up a submission this browser did not create. Returns whether it did.
	 *
	 * The chain, not local storage, is what says a commitment exists. A cleared
	 * browser, a second device, a second browser, a private window, a reinstall
	 * and a storage write that silently failed all produce the same state: the
	 * contract holds a commitment this submission knows nothing about, and the
	 * stake is lost unless it can be revealed.
	 *
	 * A game that can reconstruct the actions - by asking the player to re-enter
	 * them, or by enumerating a small action space - hands the result here and the
	 * submission carries on as if it had never forgotten. It is the ONLY method
	 * the framework adds for this, deliberately: see {@link
	 * SubmissionStore.adopt}'s implementation for what it refuses and why.
	 */
	adopt(submission: PersistedSubmission<TAction>): boolean;
	/** Begin watching the cycle. Returns the teardown. */
	start(): () => void;
};

/**
 * The default secret: 32 random bytes.
 *
 * Safe, but not the only sensible choice, which is why `makeSecret` exists.
 * reveal-or-die, bomber-world and stratagems all DERIVE the secret instead,
 * from a signature by a key the player already holds. That is strictly better
 * against the failure that costs real money here: a random secret exists only
 * in storage, so losing storage loses the stake, while a derived one can be
 * recomputed on another device from the key alone.
 *
 * `createDerivedSecret` in `./secret.ts` is that, ready to pass in.
 */
function randomSecret(): `0x${string}` {
	const bytes = new Uint8Array(32);
	// `crypto` is present in browsers and in Node 19+, which covers the app and
	// the test runner. A game that must run somewhere else supplies its own.
	crypto.getRandomValues(bytes);
	let hex = '0x';
	for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
	return hex as `0x${string}`;
}

export function createSubmission<
	TIdentity extends PlayerIdentity,
	TAction,
>(params: {
	cycleInfo: CycleInfoStore;
	adapter: CommitRevealAdapter<TIdentity, TAction>;
	storage: SubmissionStorage<TAction>;
	/** Who is playing, or undefined when nobody is connected. */
	identity: Readable<TIdentity | undefined>;
	/**
	 * Send the commitment automatically when the commit phase is about to
	 * close. On by default: a game may prefer the player to press the button.
	 */
	autoCommit?: boolean;
	/**
	 * Whether a turn with NOTHING planned should still be committed and revealed.
	 *
	 * Default false, which is right for a game where a quiet cycle simply passes:
	 * committing an empty submission would spend gas to say nothing.
	 *
	 * It is wrong, and expensively so, for a game that PUNISHES SILENCE. Where
	 * what is at stake DECAYS rather than sitting in a bond - an avatar that dies
	 * after a few missed submissions, a character that loses levels - the contract
	 * measures liveness by reveals, so a player who watches a few cycles without
	 * moving loses what they paid for, having done nothing wrong and been told
	 * nothing. The client has to keep the loop turning on their behalf.
	 *
	 * A decaying stake is one of the two obvious ways to satisfy "something must
	 * be at stake, or nobody has to reveal", which is why this is framework rather
	 * than one game's workaround.
	 *
	 * A PREDICATE rather than a flag, because the answer changes minute to minute:
	 * it is only true while the game is actually holding something that can die.
	 * An entity waiting to enter play has no clock running against it, and
	 * committing empty submissions for it would burn gas for nothing.
	 *
	 * It has to live here rather than in the game because the submission owns the
	 * cycle loop, the secret and the storage, and a game cannot express "commit
	 * nothing" from outside: `plan([])` means "nothing is pending", not "send an
	 * empty turn".
	 *
	 * KNOWN TENSION, worth reading before building a deliberate exit on top of
	 * this: an idle player with the tab open never dies and quietly spends gas, so
	 * this makes death-by-silence unreachable and removes the natural way to
	 * leave. A game with an explicit exit, a forfeit, or a way to stop being
	 * waited for has to make this predicate agree with it, or the framework will
	 * spend gas preventing the departure the player just asked for.
	 */
	commitWhenIdle?: () => boolean;
	/**
	 * When this browser should send the reveal itself. Defaults to `immediately`.
	 *
	 * This is NOT a choice about whether the player may reveal: `reveal()` is
	 * always callable, and a third party can always reveal on their behalf (every
	 * one of these contracts takes the identity as an argument rather than using
	 * msg.sender, deliberately). It only decides what the submission does on its
	 * own.
	 *
	 * - `immediately`: reveal as soon as the phase opens. Right for any game
	 *   whose cycle is short enough that the player is plausibly still there,
	 *   and for a hot-seat or single-machine setup where turns are simply waited
	 *   out.
	 * - `fallback`: something else is expected to reveal (a scheduler holding a
	 * timelock-encrypted transaction, see `CommitRevealAdapter.commit`), but this
	 * browser tries anyway once the phase is nearly over and the submission is
	 * still open. A duplicate reveal is cheap - the loser of the race reverts -
	 * and a missed one is not, so trying is the right bias.
	 * - `never`: something else owns it entirely.
	 *
	 * A game on a 23h/1h commit/reveal split cannot expect anyone to be at the
	 * keyboard for the reveal hour, which is why stratagems and catacombs schedule
	 * it; a game whose cycle is minutes long can just do it here. Both remain the
	 * player's to trigger by hand.
	 */
	autoReveal?: 'immediately' | 'fallback' | 'never';
	/**
	 * How late into the reveal phase `autoReveal: 'fallback'` waits before trying
	 * anyway, as a fraction of the phase. Defaults to 0.5.
	 */
	fallbackRevealAfter?: number;
	/**
	 * Produce the secret for a cycle. Defaults to 32 random bytes.
	 *
	 * A game overrides this to DERIVE the secret from a key the player already
	 * holds, which makes a submission recoverable after local storage is lost. See
	 * `randomSecret` above and `createDerivedSecret` in `./secret.ts`.
	 *
	 * IT IS HANDED THE IDENTITY, not only the cycle, and a derivation that
	 * ignores it is wrong wherever one account can hold several. Two identities
	 * deriving the same secret means either can open the other's commitment by
	 * enumerating a small action space against the published hash, so the hiding
	 * property is gone from the inside. The framework passes it so that the
	 * cheapest correct derivation is also the obvious one.
	 */
	makeSecret?: (params: {
		cycleNumber: number;
		identity: TIdentity;
	}) => `0x${string}` | Promise<`0x${string}`>;
	/**
	 * Called when a submission completes, so the caller can refresh chain state.
	 *
	 * AWAITED before the submission reports itself revealed, and that ordering is
	 * the whole point. The planned placements are drawn from the submission, and
	 * the confirmed ones from the board; flipping to `Revealed` first would clear
	 * the planned overlay while the board was still a fetch behind, and the player
	 * would watch their moves vanish and then reappear. The data is already on
	 * chain at this point, so there is no reason to show a gap.
	 */
	onSettled?: () => void | Promise<void>;
}): SubmissionStore<TIdentity, TAction> {
	const {cycleInfo, adapter, storage, identity} = params;
	const autoCommit = params.autoCommit ?? true;
	const commitWhenIdle = params.commitWhenIdle ?? (() => false);
	const autoReveal = params.autoReveal ?? 'immediately';
	const fallbackRevealAfter = params.fallbackRevealAfter ?? 0.5;
	const makeSecret = params.makeSecret ?? (() => randomSecret());

	let $state: SubmissionState<TAction> = {step: 'Idle'};
	const store = writable<SubmissionState<TAction>>($state);

	function set(next: SubmissionState<TAction>) {
		$state = next;
		store.set(next);
	}

	/** The actions of whatever submission is currently in play, if any. */
	function currentActions(): readonly TAction[] {
		return 'actions' in $state ? $state.actions : [];
	}

	function currentIdentity(): TIdentity | undefined {
		return get(identity);
	}

	/**
	 * Is there an identity at all?
	 *
	 * `=== undefined` and NOT `!player`, which is the same thing for an address
	 * and wrong for the other half of `PlayerIdentity`: a token id of `0n` is
	 * falsy, so a truthiness test silently refuses to commit or reveal for it.
	 * The symptom would be a player whose turns never go out, with nothing
	 * logged and no error, and only for whoever holds token zero.
	 */
	function hasIdentity(player: TIdentity | undefined): player is TIdentity {
		return player !== undefined;
	}

	/**
	 * Whether the submission owes NOTHING for the cycle now closing, which is the
	 * question `commitWhenIdle` is asked about.
	 *
	 * Not the same as `step === 'Idle'`, and reading it that way stopped the
	 * liveness loop after exactly one turn. A submission that has been revealed
	 * sits on `Revealed` - there is nothing to put it back to `Idle`, and nothing
	 * should, since the HUD reports the outcome from it - so a player who moved
	 * once and then stood still committed nothing ever again, and lost what they
	 * held a few cycles later to the very silence this option exists to prevent.
	 * Found in play, not in review.
	 *
	 * A FINISHED submission from an EARLIER cycle is nothing pending. The cycle
	 * comparison is what makes that safe: a submission revealed in the cycle still
	 * running has already had its commitment, and a second one for the same cycle
	 * is not something to send.
	 */
	function nothingPendingFor(currentCycleNumber: number): boolean {
		if ($state.step === 'Idle') return true;
		if ($state.step === 'Revealed' || $state.step === 'Missed') {
			return $state.cycleNumber < currentCycleNumber;
		}
		return false;
	}

	/**
	 * The cycle a plan made right now would be committed in.
	 *
	 * During the commit phase that is this cycle. During the REVEAL phase the
	 * commit window has closed, so anything planned now is for the next one.
	 * Stamping it that way is what stops it being thrown away as stale the moment
	 * the cycle turns over: a player who keeps clicking while the submission
	 * resolves is planning ahead, not making a mistake.
	 */
	function cycleNumberBeingPlannedFor(): number {
		const info = cycleInfo.now();
		return info.isCommitPhase
			? info.currentCycleNumber
			: info.currentCycleNumber + 1;
	}

	function plan(actions: readonly TAction[]) {
		// Once the commitment is sent the actions are fixed: they are what the
		// hash is of, and what the reveal has to reproduce exactly.
		if (
			$state.step === 'Committing' ||
			$state.step === 'Committed' ||
			$state.step === 'Revealing'
		) {
			return;
		}
		const cycleNumber = cycleNumberBeingPlannedFor();
		if (actions.length === 0) {
			// Nothing planned is the same as nothing pending, and a stored empty
			// submission would only be a way to reveal nothing later.
			storage.clear();
			set({step: 'Idle'});
			return;
		}
		set({step: 'Planning', cycleNumber, actions});
	}

	async function commit() {
		// `Idle` is allowed only for a game that has asked for it: see
		// `commitWhenIdle`. Everything below already copes with an empty action list
		// (the commitment hashes it, the reveal discloses it, and a contract's action
		// loop simply does nothing), so what is being decided here is only whether an
		// empty turn is worth sending.
		const idleButOwed =
			nothingPendingFor(cycleInfo.now().currentCycleNumber) && commitWhenIdle();
		if ($state.step !== 'Planning' && $state.step !== 'Error' && !idleButOwed) {
			return;
		}
		const actions = currentActions();
		if (actions.length === 0 && !idleButOwed) return;

		const player = currentIdentity();
		if (!hasIdentity(player)) return;

		const info = cycleInfo.now();
		if (!info.isCommitPhase) {
			// The commit phase closed while the player was deciding. Their moves
			// are kept, but this cycle is gone.
			return;
		}
		const cycleNumber = info.currentCycleNumber;
		const secret = await makeSecret({cycleNumber, identity: player});
		const {hash} = adapter.buildCommitment({actions, secret});

		// Persisted BEFORE the call, so a reload during the wallet prompt cannot
		// leave a commitment nobody can open. See the file comment.
		storage.save({cycleNumber, actions, secret, committed: false});

		set({step: 'Committing', cycleNumber, actions});
		try {
			await adapter.commit({
				identity: player,
				hash,
				actions,
				secret,
				cycleNumber,
				// TAKEN FROM THE CYCLE, not recomputed from the deployment. A
				// manually advanced chain has no clock, so there is no moment to
				// predict and nothing a scheduler could be told; and under a policy
				// that allows early advance the cycle's origin moves, so the same
				// arithmetic run against the deployment's start time would answer
				// for a grid the chain has left behind - and a scheduled reveal is
				// the one thing that cannot be re-asked later.
				revealDueAt: info.type === 'manual' ? undefined : info.revealOpensAt,
			});
			storage.save({cycleNumber, actions, secret, committed: true});
			set({step: 'Committed', cycleNumber, actions});
		} catch (error) {
			// The commitment never went out, so nothing is at stake and the stored
			// submission would only confuse the next load.
			storage.clear();
			set({
				step: 'Error',
				cycleNumber,
				during: 'commit',
				message: messageOf(error),
				error,
				actions,
			});
		}
	}

	async function reveal() {
		const pending = storage.load();
		if (!pending || !pending.committed) return;
		if ($state.step === 'Revealing' || $state.step === 'Revealed') return;

		const player = currentIdentity();
		if (!hasIdentity(player)) return;

		const info = cycleInfo.now();
		if (info.currentCycleNumber !== pending.cycleNumber) {
			// Too late: the contract only accepts a reveal in the cycle that was
			// committed to.
			storage.clear();
			set({step: 'Missed', cycleNumber: pending.cycleNumber});
			return;
		}

		set({
			step: 'Revealing',
			cycleNumber: pending.cycleNumber,
			actions: pending.actions,
		});
		try {
			await adapter.reveal({
				identity: player,
				actions: pending.actions,
				secret: pending.secret,
				// GUARDED ON THE CURRENT STATE rather than written blind. The
				// adapter reports progress from inside an await, and a cycle that
				// turned over meanwhile has already moved this submission to
				// `Missed`; writing a `Revealing` back over that would tell the
				// player their turn was still going out when the window had shut.
				onProgress: (progress) => {
					if (
						$state.step === 'Revealing' &&
						$state.cycleNumber === pending.cycleNumber
					) {
						set({...$state, progress});
					}
				},
			});
			// Refresh FIRST, then report revealed: see the note on onSettled.
			try {
				await params.onSettled?.();
			} catch {
				// A failed refresh is not a failed reveal. The reveal is on chain
				// either way, and the poller will catch up on its own interval.
			}
			storage.clear();
			set({step: 'Revealed', cycleNumber: pending.cycleNumber});
		} catch (error) {
			// The stored submission is deliberately KEPT: the reveal can be retried for
			// as long as the phase lasts, and dropping the secret here would
			// forfeit the stake over a rejected wallet prompt.
			set({
				step: 'Error',
				cycleNumber: pending.cycleNumber,
				during: 'reveal',
				message: messageOf(error),
				error,
				actions: pending.actions,
			});
		}
	}

	function dismiss() {
		if ($state.step === 'Missed' || $state.step === 'Revealed') {
			set({step: 'Idle'});
		}
	}

	/**
	 * Take up a submission, wherever it came from.
	 *
	 * THE BODY OF `restore()`, lifted so that storage is not the only place a
	 * submission may come from. A submission reconstructed from the chain is a
	 * RESTORED submission and nothing downstream should be able to tell the
	 * difference, which is why this adds no state: every consumer that switches on
	 * `SubmissionState` keeps working because there is nothing new to switch on.
	 *
	 * It refuses two things, and both refusals are the point rather than
	 * defensive noise.
	 *
	 * A SUBMISSION FROM ANOTHER CYCLE. Only the cycle in progress can still be
	 * revealed; adopting an older one would put the submission into `Committed`
	 * for a window that has shut, and it would then spend gas on a reveal the
	 * contract refuses. A commitment left over from an earlier cycle is a MISSED
	 * reveal, which is a settlement the player presses for themselves, not
	 * something to recover.
	 *
	 * A SUBMISSION WHILE A TRANSACTION IS IN FLIGHT. This writes to storage, and
	 * storage is where the secret for an unlanded commitment lives. Overwriting
	 * it mid-commit would leave a commitment on chain whose secret is gone,
	 * which is the exact loss the whole file is arranged to prevent, and it
	 * would happen silently.
	 *
	 * IT SAVES ON THE WAY THROUGH, so a second reload costs nothing: what was
	 * reconstructed once is now an ordinary stored submission.
	 */
	function adopt(pending: PersistedSubmission<TAction>): boolean {
		if (pending.cycleNumber !== cycleInfo.now().currentCycleNumber)
			return false;
		if ($state.step === 'Committing' || $state.step === 'Revealing')
			return false;

		storage.save(pending);
		set(
			pending.committed
				? {
						step: 'Committed',
						cycleNumber: pending.cycleNumber,
						actions: pending.actions,
					}
				: {
						step: 'Planning',
						cycleNumber: pending.cycleNumber,
						actions: pending.actions,
					},
		);
		return true;
	}

	/** Adopt whatever was left behind by a previous page load. */
	function restore() {
		const pending = storage.load();
		if (!pending) return;

		if (adopt(pending)) return;

		// An older cycle. A committed submission that was never revealed has already
		// cost the player; an uncommitted one costs nothing and is just dropped.
		storage.clear();
		if (pending.committed) {
			set({step: 'Missed', cycleNumber: pending.cycleNumber});
		}
	}

	function start() {
		restore();

		let previousCycleNumber: number | undefined;

		const unsubscribeCycle = cycleInfo.subscribe(($info) => {
			const cycleChanged =
				previousCycleNumber !== undefined &&
				$info.currentCycleNumber !== previousCycleNumber;
			previousCycleNumber = $info.currentCycleNumber;

			if (cycleChanged) {
				if ($state.step === 'Committed' || $state.step === 'Revealing') {
					// The cycle turned over with a commitment still open: the reveal
					// window is gone.
					storage.clear();
					set({step: 'Missed', cycleNumber: $state.cycleNumber});
				} else if ($state.step === 'Planning' || $state.step === 'Error') {
					// A plan made during the reveal phase was stamped for THIS cycle,
					// which has just begun, so it is not stale and must survive. Only
					// drop a plan whose commit window has actually gone by.
					if ($state.cycleNumber < $info.currentCycleNumber) {
						storage.clear();
						set({step: 'Idle'});
					}
				}
			}

			// Tested as a CONDITION, not as a transition into the reveal phase: a
			// page loaded (or a wallet connected) part-way through that phase has no
			// transition to observe, and owes a reveal just the same.
			if (!$info.isCommitPhase && $state.step === 'Committed') {
				if (autoReveal === 'immediately') {
					void reveal();
					// `!== 'manual'`, NOT `=== 'timed'`: every policy with a clock
					// behind it can answer "how much of the reveal window is left",
					// and the hybrid one carries exactly the same timings. Testing
					// for one named policy instead of for the PROPERTY being used
					// is how a third policy silently turned this off - and what it
					// turns off is the reveal that protects the stake.
				} else if (autoReveal === 'fallback' && $info.type !== 'manual') {
					// Whoever was supposed to do this has had most of the phase. The
					// submission is still open, so try: a duplicate reveal costs one
					// reverted transaction, a missed one costs the stake.
					const elapsed =
						1 - $info.timeLeftInPhase / $info.config.revealPhaseDuration;
					if (elapsed >= fallbackRevealAfter) void reveal();
				}
			}

			if (
				autoCommit &&
				// See the note above: the question is whether there is a clock to
				// read, not which of the clocked policies this is.
				$info.type !== 'manual' &&
				$info.isCommitPhase &&
				($state.step === 'Planning' ||
					// Nothing planned, but silence costs this game's player what they
					// hold. See `commitWhenIdle`, and `nothingPendingFor` for why this is
					// not simply `Idle`: the submission that just ended is still being
					// reported, and it owes the next cycle a turn all the same.
					(nothingPendingFor($info.currentCycleNumber) && commitWhenIdle())) &&
				$info.timeLeftForCommitEnd <= $info.config.commitTimeAllowance
			) {
				void commit();
			}
		});

		return () => unsubscribeCycle();
	}

	return {
		get value() {
			return $state;
		},
		subscribe: store.subscribe,
		plan,
		commit,
		reveal,
		dismiss,
		adopt,
		start,
	};
}

function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

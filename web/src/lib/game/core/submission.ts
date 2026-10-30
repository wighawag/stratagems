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
import type {
	CommitRevealAdapter,
	PlayerIdentity,
	RevealScheduler,
} from './seams';
import {revealPhaseStartTime, type CycleInfoStore} from './cycle';
import type {LiveCommitment} from './recovery';

/**
 * What has to survive a reload.
 *
 * Kept deliberately small and JSON-shaped: it is written to whatever storage
 * the game hands over, in the middle of a phase, and anything clever here is a
 * way to lose a secret.
 */
export type PersistedSubmission<TAction, TExtensions extends object = {}> = {
	cycleNumber: number;
	actions: readonly TAction[];
	secret: `0x${string}`;
	/** Set once the commit transaction has been submitted. */
	committed: boolean;
	/**
	 * The commitment's hash, set by the commit. What the chain is asked about:
	 * where two records claim one cycle (two devices that both committed), the
	 * one whose hash the chain holds is the turn.
	 */
	commitmentHash?: `0x${string}`;
	/**
	 * Whether THIS turn's reveal was handed to a scheduler. Absent when the game
	 * has no scheduler; `false` when it has one and scheduling this turn failed,
	 * which is what makes the browser reveal it at once rather than wait for the
	 * fallback point (P7).
	 */
	revealScheduled?: boolean;
	/**
	 * What LAYERS keep with this turn, each under its own namespace
	 * (`{fuzd?: FuzdSchedule}`), round-tripped untouched: the framework never
	 * reads it, stores it beside the turn it belongs to, and so it goes wherever
	 * the turn goes (synced, encrypted, cleared). Each layer exports the type of
	 * its own namespace, and a game composes them in its `GameTypes`, so nothing a
	 * layer wrote comes back `unknown`. Must be JSON.
	 */
	extensions?: TExtensions;
};

/**
 * Where the pending submission is kept between page loads.
 *
 * A port rather than a direct `localStorage` call: the submission is
 * constructed during SSR too, and a game with an account system may want the
 * submission scoped to the signed-in player rather than to the browser.
 */
export type SubmissionStorage<TAction, TExtensions extends object = {}> = {
	load(): PersistedSubmission<TAction, TExtensions> | undefined;
	save(submission: PersistedSubmission<TAction, TExtensions>): void;
	clear(): void;
	/**
	 * Whether what is stored can be read yet. ABSENT MEANS ALWAYS READY, which is
	 * what a synchronous storage (`localStorage`) is.
	 *
	 * A storage that loads asynchronously (the account data, Q8-1) says `false`
	 * until it has loaded, and again while it loads another account's. The
	 * submission restores on every transition to ready (the first, an account
	 * switch), refuses `plan` and `commit` before it, makes a `reveal()` asked
	 * for wait for it, and clears nothing while it is not: `load()` answering
	 * `undefined` then means "not known yet", not "nothing stored".
	 */
	ready?: Readable<boolean>;
	/**
	 * Save, resolving once the record is ON STORAGE and rejecting when it could
	 * not be put there. The commit awaits it before the commitment is sent, and a
	 * rejection refuses the commit (the secret would not survive a reload).
	 * Absent, `save` is taken to be durable when it returns.
	 */
	saveDurably?(
		submission: PersistedSubmission<TAction, TExtensions>,
	): Promise<void>;
	/**
	 * Every COMMITTED turn stored for a cycle: kept apart from the plan, never
	 * overwritten or cleared by the submission, and possibly more than one where
	 * two devices committed in one cycle (the chain's hash decides). Restore
	 * looks here first. Absent, the plan's record is all there is.
	 */
	committedTurns?(
		cycleNumber: number,
	): readonly PersistedSubmission<TAction, TExtensions>[];
	/**
	 * Emits when what is stored changes from ELSEWHERE too (another device by
	 * sync, another tab): the submission then adopts a record that arrived after
	 * it was ready, under `adopt()`'s own guard.
	 */
	changes?: Readable<unknown>;
	/**
	 * This cycle's turn is closed on chain (revealed or settled): what is kept
	 * of it may be pruned.
	 */
	settled?(cycleNumber: number): void;
};

export type SubmissionState<TAction> =
	/** No player, or nothing planned yet this cycle. */
	| {step: 'Idle'}
	/** Actions chosen, still changeable. */
	| {step: 'Planning'; cycleNumber: number; actions: readonly TAction[]}
	| {step: 'Committing'; cycleNumber: number; actions: readonly TAction[]}
	/** The commitment is in; the reveal is owed this cycle. */
	| {
			step: 'Committed';
			cycleNumber: number;
			actions: readonly TAction[];
			/**
			 * Whether a scheduler holds this turn's reveal: absent without one,
			 * `false` when scheduling it failed (so this browser reveals it
			 * itself as soon as the phase opens). See `PersistedSubmission`.
			 */
			revealScheduled?: boolean;
	  }
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
	TExtensions extends object = {},
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
	adopt(submission: PersistedSubmission<TAction, TExtensions>): boolean;
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
	TExtensions extends object = {},
>(params: {
	cycleInfo: CycleInfoStore;
	adapter: CommitRevealAdapter<TIdentity, TAction>;
	storage: SubmissionStorage<TAction, TExtensions>;
	/**
	 * Who else sends the reveal, when the game has one (see `RevealScheduler`).
	 * Handed to the adapter at each commit; the outcome is recorded per turn, so
	 * a turn whose scheduling failed is revealed by this browser at once even
	 * under `autoReveal: 'fallback'`.
	 */
	scheduler?: RevealScheduler<TIdentity, TExtensions>;
	/**
	 * The commitment the chain holds for the cycle in progress, when the game
	 * reads it (the skeleton passes the missed-reveal reader's). It decides
	 * between two committed records for one cycle, and takes up a plan whose
	 * commit went out but was never recorded as committed.
	 */
	liveCommitment?: Readable<LiveCommitment | undefined>;
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
	 *
	 * `fallback` is PER TURN where a `scheduler` is given: a turn whose scheduling
	 * failed (`revealScheduled: false`) is revealed `immediately`, because nobody
	 * else is going to.
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
}): SubmissionStore<TIdentity, TAction, TExtensions> {
	const {cycleInfo, adapter, storage, identity} = params;
	const autoCommit = params.autoCommit ?? true;
	const commitWhenIdle = params.commitWhenIdle ?? (() => false);
	const autoReveal = params.autoReveal ?? 'immediately';
	const fallbackRevealAfter = params.fallbackRevealAfter ?? 0.5;
	const makeSecret = params.makeSecret ?? (() => randomSecret());
	const {scheduler} = params;
	type Persisted = PersistedSubmission<TAction, TExtensions>;

	let $state: SubmissionState<TAction> = {step: 'Idle'};
	const store = writable<SubmissionState<TAction>>($state);

	/**
	 * Bumped whenever the storage stops being ready (an account switch, a load
	 * error) or the identity changes: anything that awaited across one of those
	 * belongs to a context that is gone, and must not write into the new one.
	 */
	let generation = 0;

	/** Whether the storage can be read and written now. See `ready`. */
	function isReady(): boolean {
		return storage.ready ? get(storage.ready) : true;
	}

	/** Resolves once the storage is ready, or with `false` if stopped first. */
	let releaseWaiters: (() => void) | undefined;
	function whenReady(): Promise<boolean> {
		if (isReady()) return Promise.resolve(true);
		const ready = storage.ready!;
		return new Promise<boolean>((resolve) => {
			let unsubscribe: (() => void) | undefined;
			const previous = releaseWaiters;
			const done = (value: boolean) => {
				unsubscribe?.();
				unsubscribe = undefined;
				resolve(value);
			};
			releaseWaiters = () => {
				previous?.();
				done(false);
			};
			unsubscribe = ready.subscribe(($ready) => {
				if ($ready) queueMicrotask(() => done(true));
			});
		});
	}

	function set(next: SubmissionState<TAction>) {
		$state = next;
		store.set(next);
	}

	/** The committed turn the state shows, and its hash: what reveal opens. */
	let shownTurn: Persisted | undefined;
	let shownHash: `0x${string}` | undefined;

	function committedState(record: Persisted): SubmissionState<TAction> {
		shownTurn = record;
		shownHash = record.commitmentHash;
		return {
			step: 'Committed',
			cycleNumber: record.cycleNumber,
			actions: record.actions,
			...(record.revealScheduled === undefined
				? {}
				: {revealScheduled: record.revealScheduled}),
		};
	}

	/**
	 * When this browser reveals THIS turn: the game's `autoReveal`, except that a
	 * turn a scheduler was supposed to hold and does not is revealed at once.
	 */
	function revealModeFor(
		state: SubmissionState<TAction>,
	): 'immediately' | 'fallback' | 'never' {
		if (
			autoReveal === 'fallback' &&
			state.step === 'Committed' &&
			state.revealScheduled === false
		) {
			return 'immediately';
		}
		return autoReveal;
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
		// Not before the storage is ready: what it holds may be a committed turn,
		// and a plan laid over it would be one the player cannot commit.
		if (!isReady()) return;
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
		// Not before the storage is ready: the secret has to be stored first, and
		// what is stored may already be this cycle's committed turn.
		if (!isReady()) return;
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
		const startedIn = generation;
		const secret = await makeSecret({cycleNumber, identity: player});
		if (generation !== startedIn) return;
		const {hash} = adapter.buildCommitment({actions, secret});

		// Persisted BEFORE the call, so a reload during the wallet prompt cannot
		// leave a commitment nobody can open. See the file comment. DURABLY where
		// the storage can say so: a write still in flight when the tab closes is a
		// commitment nobody can open, so the commit waits for it, and a write that
		// failed refuses the commit.
		const record: Persisted = {
			cycleNumber,
			actions,
			secret,
			committed: false,
			commitmentHash: hash,
		};
		set({step: 'Committing', cycleNumber, actions});
		if (storage.saveDurably) {
			try {
				await storage.saveDurably(record);
			} catch (error) {
				if (generation !== startedIn) return;
				set({
					step: 'Error',
					cycleNumber,
					during: 'commit',
					message: messageOf(error),
					error,
					actions,
				});
				return;
			}
			if (generation !== startedIn) return;
		} else {
			storage.save(record);
		}

		try {
			const outcome = await adapter.commit<TExtensions>({
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
				...(scheduler ? {scheduler} : {}),
			});
			// THE CONTEXT MOVED ON while the commitment went out (an account
			// switch): this turn is not the new identity's, so it is neither
			// stored nor shown as theirs. Its secret is already stored for the
			// identity that committed, and the chain's hash takes it back up there.
			if (generation !== startedIn) return;
			// ANYTHING BUT `true` IS NOT SCHEDULED: an adapter that ignored the
			// scheduler reports nothing, and a turn nobody else will reveal must be
			// revealed here.
			const revealScheduled = scheduler
				? outcome?.revealScheduled === true
				: undefined;
			const committed: Persisted = {
				...record,
				committed: true,
				...(revealScheduled === undefined ? {} : {revealScheduled}),
				...(outcome?.extensions
					? {extensions: outcome.extensions as TExtensions}
					: {}),
			};
			storage.save(committed);
			set(committedState(committed));
		} catch (error) {
			if (generation !== startedIn) return;
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
		// ASKED FOR BEFORE THE STORAGE IS READY, IT WAITS: returning would look
		// like "nothing to reveal" when the truth is "not read yet".
		if (!isReady() && !(await whenReady())) return;
		// Everything below awaits the chain; an identity or account change
		// meanwhile makes this reveal another context's, and it must then touch
		// neither the new context's storage nor its state.
		const startedIn = generation;
		// The turn the state shows, which may have come from the committed
		// turns rather than the plan's record; then whatever storage holds.
		const pending =
			shownTurn &&
			($state.step === 'Committed' || $state.step === 'Error') &&
			$state.cycleNumber === shownTurn.cycleNumber
				? shownTurn
				: (storedTurnFor(cycleInfo.now().currentCycleNumber)?.turn ??
					storage.load());
		if (!pending || !pending.committed) return;
		if ($state.step === 'Revealing' || $state.step === 'Revealed') return;

		const player = currentIdentity();
		if (!hasIdentity(player)) return;

		const info = cycleInfo.now();
		if (info.currentCycleNumber !== pending.cycleNumber) {
			// Too late: the contract only accepts a reveal in the cycle that was
			// committed to. Whether it is MISSED is the chain's to say: somebody
			// else may have revealed it in time.
			closeEarlierTurn(pending, player);
			return;
		}

		set({
			step: 'Revealing',
			cycleNumber: pending.cycleNumber,
			actions: pending.actions,
		});
		try {
			// `alreadyRevealed` is somebody else's reveal of this very turn, which
			// is the same outcome as ours: the turn is open on chain.
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
						generation === startedIn &&
						$state.step === 'Revealing' &&
						$state.cycleNumber === pending.cycleNumber
					) {
						set({...$state, progress});
					}
				},
			});
			if (generation !== startedIn) return;
			await reportRevealed(pending.cycleNumber, startedIn);
		} catch (error) {
			if (generation !== startedIn) return;
			// A REVEAL THAT FAILED BECAUSE THE TURN IS ALREADY OPEN is a revealed
			// turn: a game's adapter may throw where the base's reports it, so the
			// chain is asked before the failure is believed.
			if (
				(await statusOnChain(pending, player)) === 'revealed' &&
				generation === startedIn &&
				isRevealing(pending.cycleNumber)
			) {
				await reportRevealed(pending.cycleNumber, startedIn);
				return;
			}
			if (generation !== startedIn) return;
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

	/**
	 * Read through a function so TypeScript does not carry a narrowing of
	 * `$state` across an await, which the state may well have changed under.
	 */
	function isRevealing(cycleNumber: number): boolean {
		return $state.step === 'Revealing' && $state.cycleNumber === cycleNumber;
	}

	/** Refresh FIRST, then report revealed: see the note on onSettled. */
	async function reportRevealed(cycleNumber: number, startedIn: number) {
		try {
			await params.onSettled?.();
		} catch {
			// A failed refresh is not a failed reveal. The reveal is on chain
			// either way, and the poller will catch up on its own interval.
		}
		if (generation !== startedIn) return;
		storage.clear();
		storage.settled?.(cycleNumber);
		set({step: 'Revealed', cycleNumber});
	}

	/** What the chain says about a turn, `unknown` when it cannot be asked. */
	async function statusOnChain(
		turn: Persisted,
		player: TIdentity,
	): Promise<'open' | 'revealed' | 'unknown'> {
		if (!adapter.commitmentStatus) return 'unknown';
		try {
			return await adapter.commitmentStatus({
				identity: player,
				actions: turn.actions,
				secret: turn.secret,
				cycleNumber: turn.cycleNumber,
			});
		} catch {
			return 'unknown';
		}
	}

	/**
	 * A committed turn whose cycle has gone by: MISSED, unless the chain says
	 * somebody revealed it (P9). A scheduler that did its job leaves this
	 * browser `Committed` with nothing sent, and before this the player was told
	 * they had missed a reveal that had in fact gone out.
	 *
	 * The state is `Idle` while the chain is asked, and the answer is written
	 * only if nothing has happened since (a new plan is the player moving on,
	 * and the missed-reveal reader asks the chain on its own).
	 *
	 * THE STORED RECORD IS CLEARED ONLY ONCE THE CHAIN HAS ANSWERED, in the
	 * context that asked. A context left meanwhile (the account data reloading,
	 * the identity flickering or changing) drops the answer, as every await in
	 * this file does, and the record is what lets the next `restore()` ask again.
	 * Cleared at once, as it was, a flicker during the question left nothing to
	 * restore and the turn read `Idle` for good: a turn somebody else revealed
	 * (a scheduler, another tab) was reported neither revealed nor missed. Found
	 * by stratagems' step 8 e2e, one run in five.
	 */
	function closeEarlierTurn(turn: Persisted, player: TIdentity | undefined) {
		if (!adapter.commitmentStatus || !hasIdentity(player)) {
			// Nothing to ask: the old reading.
			storage.clear();
			set({step: 'Missed', cycleNumber: turn.cycleNumber});
			return;
		}
		// Already being asked about in this context (a `reveal()` finds the record
		// the question keeps): one question, one report.
		if (
			closing &&
			closing.generation === generation &&
			sameTurn(closing.turn, turn)
		) {
			return;
		}
		const startedIn = generation;
		closing = {generation: startedIn, turn};
		set({step: 'Idle'});
		void (async () => {
			const status = await statusOnChain(turn, player);
			if (generation !== startedIn) return;
			const stillIdle = $state.step === 'Idle';
			if (status === 'revealed' && stillIdle) {
				try {
					await params.onSettled?.();
				} catch {
					// See reportRevealed.
				}
				if (generation !== startedIn) return;
			}
			// Answered: the record is done with, whatever the state now shows.
			forgetEarlierTurn(turn);
			if (closing?.turn === turn) closing = undefined;
			if ($state.step !== 'Idle') return;
			if (status === 'revealed') {
				storage.settled?.(turn.cycleNumber);
				set({step: 'Revealed', cycleNumber: turn.cycleNumber});
			} else {
				set({step: 'Missed', cycleNumber: turn.cycleNumber});
			}
		})();
	}

	/** The earlier turn `closeEarlierTurn` is asking the chain about, if any. */
	let closing: {generation: number; turn: Persisted} | undefined;

	/**
	 * Clear the stored record if it is still the closed turn's cycle or older:
	 * a turn planned or committed for a later cycle while the chain was asked is
	 * the player's next one, and stays.
	 */
	function forgetEarlierTurn(turn: Persisted) {
		const held = storage.load();
		if (held && held.cycleNumber <= turn.cycleNumber) storage.clear();
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
	function adopt(pending: Persisted): boolean {
		return take(pending, {save: true});
	}

	/**
	 * `adopt`'s guard and state change, saving only when asked: a record that
	 * came FROM storage is already there, and writing it back would only be a
	 * change for every other device to merge.
	 */
	function take(pending: Persisted, options: {save: boolean}): boolean {
		// Not into a storage that has not loaded: the save below would be lost,
		// or written over what it is still loading.
		if (!isReady()) return false;
		if (pending.cycleNumber !== cycleInfo.now().currentCycleNumber)
			return false;
		if ($state.step === 'Committing' || $state.step === 'Revealing')
			return false;

		// Filed under its own hash, which a turn adopted from recovery does not
		// carry: two adoptions for one cycle must not share a key.
		if (options.save) {
			storage.save(
				pending.commitmentHash
					? pending
					: {...pending, commitmentHash: hashOf(pending)},
			);
		}
		set(
			pending.committed
				? committedState(pending)
				: {
						step: 'Planning',
						cycleNumber: pending.cycleNumber,
						actions: pending.actions,
					},
		);
		return true;
	}

	/**
	 * Whether the chain's head `head` is this turn's, at ANY of its chunks: after
	 * a chunk lands the head is the next chunk's hash, so a turn part way through
	 * its reveal is still this turn. Only the adapter knows how a turn is cut;
	 * without `isHeadOf` the committed hash is all that is recognised.
	 */
	function isHeldAt(turn: Persisted, head: `0x${string}`): boolean {
		if (adapter.isHeadOf) {
			return adapter.isHeadOf({
				actions: turn.actions,
				secret: turn.secret,
				head,
			});
		}
		return sameHash(hashOf(turn), head);
	}

	/** The hash a turn was committed with: recorded, or rebuilt. */
	function hashOf(turn: Persisted): `0x${string}` {
		return (
			turn.commitmentHash ??
			adapter.buildCommitment({actions: turn.actions, secret: turn.secret}).hash
		);
	}

	/**
	 * THIS CYCLE'S TURN AS STORAGE HOLDS IT: a committed turn first, then the
	 * plan (Q8-9).
	 *
	 * Where the chain's commitment for the cycle is known, IT DECIDES (Q8-8):
	 * of two committed records (two devices that both committed) the one whose
	 * hash it holds is the turn; a plan whose hash it holds is a commit that went
	 * out and was never recorded as committed (the tab closed between the two,
	 * or the account switched), and is taken up as committed; and a record the
	 * chain does NOT hold is not offered at all, so the recovery says what it
	 * should rather than a reveal that cannot land.
	 */
	function storedTurnFor(
		cycleNumber: number,
	): {turn: Persisted; recovered: boolean} | undefined {
		const live = params.liveCommitment ? get(params.liveCommitment) : undefined;
		const liveHash =
			live && live.cycleNumber === cycleNumber ? live.hash : undefined;
		const holds = (turn: Persisted) =>
			liveHash === undefined || isHeldAt(turn, liveHash);

		const plan = storage.load();
		const committed = (storage.committedTurns?.(cycleNumber) ?? []).filter(
			holds,
		);
		if (committed.length > 0) {
			// Without the chain's word, the one the plan's record names, else the
			// first: they are all this player's turns for this cycle.
			const named =
				plan && plan.committed
					? committed.find((turn) => sameHash(hashOf(turn), hashOf(plan)))
					: undefined;
			return {turn: named ?? committed[0], recovered: false};
		}
		if (!plan || plan.cycleNumber !== cycleNumber) return undefined;
		if (
			!plan.committed &&
			liveHash !== undefined &&
			plan.commitmentHash !== undefined &&
			isHeldAt(plan, liveHash)
		) {
			return {turn: {...plan, committed: true}, recovered: true};
		}
		if (plan.committed && !holds(plan)) return undefined;
		return {turn: plan, recovered: false};
	}

	/** Adopt whatever was left behind by a previous page load. */
	function restore() {
		if (!isReady() || !hasIdentity(currentIdentity())) return;
		const cycleNumber = cycleInfo.now().currentCycleNumber;
		const current = storedTurnFor(cycleNumber);
		if (current && take(current.turn, {save: current.recovered})) return;

		const pending = storage.load();
		if (!pending || pending.cycleNumber === cycleNumber) return;

		// An older cycle. A committed submission that was never revealed has already
		// cost the player, unless somebody else revealed it; an uncommitted one
		// costs nothing and is just dropped.
		if (pending.committed) {
			closeEarlierTurn(pending, currentIdentity());
		} else {
			storage.clear();
		}
	}

	/**
	 * A record that arrived AFTER ready (another device, by sync; another tab),
	 * or a chain commitment that now tells two records apart (Q8-2).
	 *
	 * Under `adopt()`'s own guard (not while committing or revealing, only for
	 * the current cycle), so a COMMITTED record replaces an uncommitted local plan
	 * or a failed commit, and the chain's choice replaces a committed turn it
	 * does not hold. A synced PLAN is taken only into an idle submission: it does
	 * not replace one being made here. A cycle already revealed or missed here is
	 * left alone.
	 */
	function adoptLate() {
		if (!isReady() || !hasIdentity(currentIdentity())) return;
		if ($state.step === 'Committing' || $state.step === 'Revealing') return;
		const cycleNumber = cycleInfo.now().currentCycleNumber;
		if (
			($state.step === 'Revealed' || $state.step === 'Missed') &&
			$state.cycleNumber === cycleNumber
		) {
			return;
		}
		const current = storedTurnFor(cycleNumber);
		if (!current) return;
		const {turn} = current;
		if (turn.committed) {
			if (
				$state.step === 'Committed' &&
				$state.cycleNumber === cycleNumber &&
				shownHash !== undefined &&
				sameHash(shownHash, hashOf(turn))
			) {
				return;
			}
		} else if ($state.step !== 'Idle') {
			return;
		}
		take(turn, {save: current.recovered});
	}

	/**
	 * What this submission showed belongs to a context that is gone (another
	 * identity, or an account whose data is reloading): forget it in MEMORY,
	 * clearing nothing stored, and let anything in flight know.
	 */
	function leaveContext() {
		generation++;
		// The turn it showed is the previous identity's: a later reveal from an
		// error state must not pick it up.
		shownTurn = undefined;
		shownHash = undefined;
		if ($state.step !== 'Idle') set({step: 'Idle'});
	}

	function start() {
		// RESTORED ON EVERY TRANSITION TO READY, not once: the first ready after
		// start, and each one after an account switch. A storage with no
		// readiness is ready now, which is the old single restore.
		let wasReady: boolean | undefined;
		const unsubscribeReady = storage.ready
			? storage.ready.subscribe(($ready) => {
					const before = wasReady;
					wasReady = $ready;
					if ($ready && before !== true) restore();
					else if (!$ready && before === true) leaveContext();
				})
			: (restore(), () => {});

		// AN IDENTITY THAT CHANGES (or first arrives) after start is a different
		// player's turn: before this, one arriving late was never restored, even
		// from localStorage.
		let previousIdentity: TIdentity | undefined;
		let identitySeen = false;
		const unsubscribeIdentity = identity.subscribe(($identity) => {
			if (!identitySeen) {
				identitySeen = true;
				previousIdentity = $identity;
				return;
			}
			if ($identity === previousIdentity) return;
			previousIdentity = $identity;
			leaveContext();
			restore();
		});

		// Records arriving from elsewhere, and the chain's word on which turn it
		// holds: both may change which turn this cycle's is.
		const unsubscribeChanges = storage.changes
			? storage.changes.subscribe(() => adoptLate())
			: () => {};
		const unsubscribeLive = params.liveCommitment
			? params.liveCommitment.subscribe(() => adoptLate())
			: () => {};

		let previousCycleNumber: number | undefined;

		const unsubscribeCycle = cycleInfo.subscribe(($info) => {
			const cycleChanged =
				previousCycleNumber !== undefined &&
				$info.currentCycleNumber !== previousCycleNumber;
			previousCycleNumber = $info.currentCycleNumber;

			// NOTHING IS CLEARED WHILE LOADING. The state is `Idle` then anyway; a
			// cycle that turns meanwhile is the restore's to handle once ready.
			if (cycleChanged && isReady()) {
				if ($state.step === 'Committed' || $state.step === 'Revealing') {
					// The cycle turned over with a commitment still open here: the
					// reveal window is gone, and the chain says whether somebody else
					// used it.
					const turn =
						shownTurn && shownTurn.cycleNumber === $state.cycleNumber
							? shownTurn
							: storage.load();
					if (turn && turn.cycleNumber === $state.cycleNumber) {
						closeEarlierTurn(turn, currentIdentity());
					} else {
						storage.clear();
						set({step: 'Missed', cycleNumber: $state.cycleNumber});
					}
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
				const mode = revealModeFor($state);
				if (mode === 'immediately') {
					void reveal();
					// `!== 'manual'`, NOT `=== 'timed'`: every policy with a clock
					// behind it can answer "how much of the reveal window is left",
					// and the hybrid one carries exactly the same timings. Testing
					// for one named policy instead of for the PROPERTY being used
					// is how a third policy silently turned this off - and what it
					// turns off is the reveal that protects the stake.
				} else if (mode === 'fallback' && $info.type !== 'manual') {
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

		return () => {
			unsubscribeCycle();
			unsubscribeIdentity();
			unsubscribeReady();
			unsubscribeChanges();
			unsubscribeLive();
			const release = releaseWaiters;
			releaseWaiters = undefined;
			release?.();
		};
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

/** One turn, whichever copy of its record: its cycle and its secret. */
function sameTurn(
	a: {cycleNumber: number; secret: string},
	b: {cycleNumber: number; secret: string},
): boolean {
	return a.cycleNumber === b.cycleNumber && sameHash(a.secret, b.secret);
}

/** Two hashes as the chain means them: hex case is not a difference. */
function sameHash(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

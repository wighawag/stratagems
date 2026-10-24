/**
 * A commitment the chain holds and this browser has no submission for.
 *
 * NOT a storage feature, which is the thing to get right before reading any of
 * it. A cleared browser, a second device, a second browser, a private window, a
 * reinstall and a storage write that silently failed all produce the same
 * state: the contract is holding a commitment, the reveal is owed this cycle,
 * and nothing here knows about it. A second device is not a mode, so this is
 * not a mode's feature - and left unhandled it costs the stake, in silence,
 * which is the most expensive thing this app can do to someone.
 *
 * THE CHAIN READ IS ALREADY THERE. `./missed-reveal.ts` asks `getCommitment`
 * on every cycle turn to find out whether the player is BLOCKED, and until now
 * it threw the live answer away: a commitment for the current cycle is not
 * blocking anything, so it reported `Clear` and returned. That branch is the
 * silent forfeit. Nothing extra is fetched for any of this.
 *
 * THE SECRET COMES BACK ON ITS OWN, because it is derived from the local
 * signer rather than stored (`game/core/secret.ts`), and the signer is itself
 * derived from a signature the wallet produces deterministically. So the same
 * account signing in anywhere recomputes the same secret for the same cycle.
 * That is the prerequisite this rests on and it landed first.
 *
 * WHAT DOES NOT COME BACK IS THE PLAN, because the chain holds only a hash.
 * Three routes exist and THIS FILE JUDGES ALL THREE THE SAME WAY, which is why
 * it is framework: local storage still has it (the ordinary reload, and nothing
 * here runs); the game ENUMERATES it, where its action space is small enough;
 * or the PLAYER re-enters it. Whichever produced the candidate, what settles it
 * is `buildCommitment` against the chain's hash, and that is one comparison.
 *
 * WHAT IS NOT HERE, and the list is D10's: no chain reader, no modal, and no
 * enumeration budget. The game supplies the commitment it read, the words it
 * says, and its own search if it has one. What the framework owns is the part
 * that was going to be written identically in every game - offer, check,
 * adopt - and the two ways of getting that subtly wrong, which are both
 * silent.
 *
 * TOO LATE IS NOT A CASE. `cycleDuration = commitPhaseDuration +
 * revealPhaseDuration` with no trailing segment, so a commitment in the
 * CURRENT cycle is always still openable: the player is either in the commit
 * phase or in the reveal phase. Once the reveal window shuts the cycle has
 * advanced, and the game's missed-reveal path reports it and offers the
 * settlement the player presses for themselves. Only the live cycle was ever
 * missing.
 *
 * **D10 SCOPED THE FRAMEWORK TO ONE METHOD AND THAT WAS TOO TIGHT**, which was
 * only knowable once a second game wanted this. The decision's reasoning holds
 * exactly as written - the isolation requirement, no new `SubmissionState`
 * member, the game keeping its chain read and its enumeration - and the
 * sentence that was wrong is the one that put the offer-and-check beside them.
 * It is identical in both games, down to the two silent failure modes below,
 * and a thing written twice in this tree is a thing that should have been
 * moved.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import type {SubmissionState, SubmissionStore} from './submission';
import type {PlayerIdentity} from './seams';

/** A commitment the contract is holding for the cycle now in progress. */
export type LiveCommitment = {
	cycleNumber: number;
	/** `bytes24`, as the contract stores it. */
	hash: `0x${string}`;
};

export type RecoveryState =
	/**
	 * Nothing to recover: no live commitment, or the submission already has it.
	 */
	| {step: 'Idle'}
	/** The chain holds a commitment this browser cannot open yet. */
	| {step: 'Found'; cycleNumber: number}
	| {step: 'Checking'; cycleNumber: number}
	/** A candidate plan was offered and it is not what was committed. */
	| {step: 'Refused'; cycleNumber: number}
	/**
	 * The check could not be made - recomputing the secret needs the signer, and
	 * the signer needs a connection.
	 *
	 * A SEPARATE STATE from `Refused`, and the distinction is the whole reason
	 * it exists: telling a player their plan was wrong when the app simply could
	 * not ask sends them looking for a mistake they did not make, and they have
	 * one cycle to find it.
	 */
	| {step: 'Failed'; cycleNumber: number; message: string};

/**
 * THERE IS NO `Recovered` STATE, and its absence is the design rather than an
 * omission. A recovered submission is a RESTORED submission: the moment `adopt`
 * takes it, the submission reports `Committed` and owes a reveal exactly as it
 * would have if this browser had never forgotten, and this store goes quiet. A
 * state saying "recovered" would be the one thing in the app able to tell the
 * two apart, which is the property D10 is built around. It was written, and the
 * test that reached for it could not: it is unreachable by construction.
 */

export type RecoveryStore<TAction> = Readable<RecoveryState> & {
	readonly value: RecoveryState;
	/**
	 * Offer a plan as the one that was committed. Resolves to whether it was.
	 *
	 * On a match the submission takes it up and carries on as though it had never
	 * forgotten, which means the reveal goes out by itself when the phase opens.
	 */
	offer(actions: readonly TAction[]): Promise<boolean>;
};

/**
 * Whether the submission already accounts for the commitment the chain is
 * holding.
 *
 * `Planning` deliberately does NOT count, even for the same cycle. It means the
 * player has clicked some cells and nothing has been sent, while the chain says
 * a commitment exists - so this browser has lost the submission and the player
 * is halfway to re-entering it without being told that is what they are doing.
 */
function submissionAccountsFor<TAction>(
	state: SubmissionState<TAction>,
	cycleNumber: number,
): boolean {
	switch (state.step) {
		case 'Committing':
		case 'Committed':
		case 'Revealing':
		case 'Revealed':
		case 'Error':
			return state.cycleNumber === cycleNumber;
		default:
			return false;
	}
}

/**
 * Compare two hashes as the chain means them, not as two strings.
 *
 * Hex case is the same silent failure that `game/core/secret.ts` normalises
 * for the derivation: two spellings of one value, no error anywhere, and a
 * refusal the player reads as "I misremembered my own turn". Both sides are
 * lowercase today; normalising costs nothing and removes the class.
 */
function sameHash(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

export function createSubmissionRecovery<
	TIdentity extends PlayerIdentity,
	TAction,
>(params: {
	submission: SubmissionStore<TIdentity, TAction>;
	/**
	 * The live commitment from the chain, or undefined.
	 *
	 * THE GAME READS IT, always, and usually from a read it is already making:
	 * whatever asks `getCommitment` to find out whether the player is BLOCKED
	 * has the live answer in its hand and has historically thrown it away.
	 */
	commitment: Readable<LiveCommitment | undefined>;
	/** Who is playing, and whose commitment this is. */
	identity: Readable<TIdentity | undefined>;
	/**
	 * The SAME derivation the submission commits with. Passed in rather than
	 * re-derived here, because two derivations that drift apart produce a
	 * refusal with no symptom and no error.
	 */
	makeSecret: (params: {
		cycleNumber: number;
		identity: TIdentity;
	}) => `0x${string}` | Promise<`0x${string}`>;
	/** The same hashing the adapter commits with, for the same reason. */
	buildCommitment: (params: {
		actions: readonly TAction[];
		secret: `0x${string}`;
	}) => {hash: `0x${string}`};
}): RecoveryStore<TAction> {
	const {submission, commitment, identity, makeSecret, buildCommitment} =
		params;

	/** Set while a candidate is being checked or has just been refused. */
	const attempt = writable<RecoveryState | undefined>(undefined);

	const state = derived(
		[submission, commitment, attempt],
		([$submission, $commitment, $attempt]): RecoveryState => {
			if (!$commitment) return {step: 'Idle'};
			if (submissionAccountsFor($submission, $commitment.cycleNumber)) {
				// Includes the submission this store just handed over: once adopted, the
				// submission IS the answer and there is nothing left to report.
				return {step: 'Idle'};
			}
			if (
				$attempt &&
				'cycleNumber' in $attempt &&
				$attempt.cycleNumber === $commitment.cycleNumber
			) {
				return $attempt;
			}
			return {step: 'Found', cycleNumber: $commitment.cycleNumber};
		},
	);

	let value: RecoveryState = {step: 'Idle'};
	state.subscribe((v) => (value = v));

	async function offer(actions: readonly TAction[]): Promise<boolean> {
		const live = get(commitment);
		const player = get(identity);
		// `=== undefined` rather than falsy: a token id of `0n` is a real identity
		// and a falsy value. See `hasIdentity` in `./submission.ts`.
		if (!live || player === undefined) return false;
		if (
			value.step !== 'Found' &&
			value.step !== 'Refused' &&
			value.step !== 'Failed'
		) {
			return false;
		}

		attempt.set({step: 'Checking', cycleNumber: live.cycleNumber});
		try {
			const secret = await makeSecret({
				cycleNumber: live.cycleNumber,
				identity: player,
			});
			const {hash} = buildCommitment({actions, secret});
			if (!sameHash(hash, live.hash)) {
				attempt.set({step: 'Refused', cycleNumber: live.cycleNumber});
				return false;
			}

			// NOTHING IS SENT. The commitment is already on chain; what was missing
			// was the ability to open it, and that is now local knowledge. The
			// submission reveals it on the phase change like any other.
			const adopted = submission.adopt({
				cycleNumber: live.cycleNumber,
				actions,
				secret,
				committed: true,
			});
			if (!adopted) {
				// The cycle turned over while the player was typing, or a commit of
				// their own is mid-flight. Neither is a wrong plan, so it must not be
				// reported as one: the missed-reveal path picks the first up on its
				// next check and the submission itself owns the second.
				attempt.set(undefined);
				return false;
			}
			// Nothing to report: the submission is `Committed` now and is the only thing
			// that should be describing itself.
			attempt.set(undefined);
			return true;
		} catch (error) {
			// REPORTED, not thrown. This is called straight from a button, so a
			// throw here is an unhandled rejection and a player who is told nothing
			// at all - during the one cycle in which the stake can still be saved.
			attempt.set({
				step: 'Failed',
				cycleNumber: live.cycleNumber,
				message: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	return {
		subscribe: state.subscribe,
		get value() {
			return value;
		},
		offer,
	};
}

/**
 * Where a pending submission is kept between page loads, for any action type.
 *
 * The stake is real, so losing this file's contents costs the player money:
 * without the secret, a commitment cannot be opened, and a missed reveal that
 * cannot be shown its chunks forfeits the whole bond (`forfeitMissedReveal`).
 * Everything here is written with that in mind.
 *
 * THE KEY AND THE RECORD ARE A WIRE (see `AGENTS.md`, "Commit-reveal rules").
 * The record's fields are fixed here, and every game on the base shares them;
 * the PREFIXES and how one action is written are the game's, passed in as a
 * {@link SubmissionStorageFormat}, so a game that already has players keeps the
 * names its records were written under. Once a game has users, changing either
 * prefix, a field below, or its codec makes `load()` discard every record a
 * previous build wrote, with the secret in it.
 */
import type {PersistedSubmission, SubmissionStorage} from '../submission';
import type {PlayerIdentity} from '../seams';

/**
 * How one game names and writes its records. A WIRE once the game has users.
 *
 * `prefix` keys the submission, `committedPrefix` the committed turn copied
 * aside beside it (see {@link committedTurnKey}); they must differ, so that
 * clearing the one cannot take the other. `encode` and `decode` turn one action
 * into JSON and back: bigint has no JSON representation, so a game whose action
 * holds one writes it as a string.
 */
export type SubmissionStorageFormat<TAction> = {
	prefix: string;
	committedPrefix: string;
	encode: (action: TAction) => unknown;
	decode: (stored: unknown) => TAction;
};

/**
 * THE ON-DISK SHAPE, and renaming anything in it is a decision rather than a
 * tidy-up: see the file comment. It is the reference game's shape, kept field
 * for field when this moved out of `placement/storage.ts`, because the
 * reference game's records are written in it.
 */
type StoredSubmission = {
	cycleNumber: number;
	actions: unknown[];
	secret: `0x${string}`;
	committed: boolean;
};

/**
 * Scoped to chain + contract + WHO PLAYS.
 *
 * Scoped so that switching account or network cannot surface someone else's
 * pending submission (which would then fail to reveal and look like a bug in
 * the contract). The last part is the identity rather than the account, which
 * is the whole difference between one pending submission per account and one
 * per thing the account plays with. A game that keys by a token and scoped this
 * by the account instead would load the previous token's planned actions and
 * commit them for the next one.
 */
export function submissionStorageKey<TIdentity extends PlayerIdentity>(params: {
	prefix: string;
	chainID: string | number;
	gameAddress: string;
	player: TIdentity;
}): string {
	return `${params.prefix}${params.chainID}_${params.gameAddress}_${params.player}`.toLowerCase();
}

/**
 * Where the last COMMITTED turn is copied aside, beside a submission's key.
 *
 * Its own prefix rather than a suffix on the submission's key, so that
 * clearing the submission (which the framework does when a reveal is missed)
 * cannot take it too. Same shape as the submission record, and the same wire.
 */
export function committedTurnKey<TAction>(
	format: SubmissionStorageFormat<TAction>,
	submissionKey: string,
): string {
	return submissionKey.replace(
		format.prefix.toLowerCase(),
		format.committedPrefix.toLowerCase(),
	);
}

/**
 * A `SubmissionStorage` backed by localStorage.
 *
 * Every operation is defensive: storage can be full, disabled, or hold
 * something from an older version of the app. A throw from here during a commit
 * would be the worst possible time for one, so failures degrade to "no pending
 * submission" instead. The one case that is NOT swallowed is a failed write,
 * which is surfaced through `onWriteFailure` so the game can refuse to commit
 * rather than commit something it will not be able to open.
 */
export function createSubmissionStorage<TAction>(params: {
	key: string;
	format: SubmissionStorageFormat<TAction>;
	onWriteFailure?: (error: unknown) => void;
}): SubmissionStorage<TAction> {
	const {key, format} = params;

	return {
		load() {
			return readStored(format, key);
		},

		save(submission) {
			if (typeof localStorage === 'undefined') return;
			const stored: StoredSubmission = {
				cycleNumber: submission.cycleNumber,
				actions: submission.actions.map(format.encode),
				secret: submission.secret,
				committed: submission.committed,
			};
			try {
				localStorage.setItem(key, JSON.stringify(stored));
				// THE COMMITTED TURN OUTLIVES THE SUBMISSION. The submission clears
				// its record when the cycle turns over with the turn still unopened,
				// and that is exactly when the chunks are worth the most: shown them,
				// the contract forfeits only the game's penalty and gives back the
				// rest of a bond that was rounded up to hide the turn. So a committed
				// turn is copied aside, and `./missed-reveal.ts` reads it.
				if (submission.committed) {
					localStorage.setItem(
						committedTurnKey(format, key),
						JSON.stringify(stored),
					);
				}
			} catch (error) {
				params.onWriteFailure?.(error);
			}
		},

		clear() {
			if (typeof localStorage === 'undefined') return;
			try {
				localStorage.removeItem(key);
			} catch {
				// Nothing useful to do; a stale entry is handled on load by the
				// submission, which discards anything from a past cycle.
			}
		},
	};
}

function readStored<TAction>(
	format: SubmissionStorageFormat<TAction>,
	storageKey: string,
): PersistedSubmission<TAction> | undefined {
	if (typeof localStorage === 'undefined') return undefined;
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) return undefined;
		const stored = JSON.parse(raw) as StoredSubmission;
		if (
			typeof stored?.cycleNumber !== 'number' ||
			!Array.isArray(stored.actions) ||
			typeof stored.secret !== 'string'
		) {
			return undefined;
		}
		return {
			cycleNumber: stored.cycleNumber,
			actions: stored.actions.map(format.decode),
			secret: stored.secret,
			committed: !!stored.committed,
		} satisfies PersistedSubmission<TAction>;
	} catch {
		// Unparseable is indistinguishable from absent as far as what can be
		// done about it, and throwing here would break the whole game.
		return undefined;
	}
}

/**
 * The last turn this browser committed for the player, if it still has it:
 * the actions and the secret, which is everything a settlement shown the
 * chunks needs. Whether it is the turn the chain is holding is the chain's to
 * say: the caller rebuilds the chain and matches the head.
 */
export function loadCommittedTurn<TAction>(
	format: SubmissionStorageFormat<TAction>,
	submissionKey: string,
): PersistedSubmission<TAction> | undefined {
	return readStored(format, committedTurnKey(format, submissionKey));
}

/** A storage that keeps nothing, for SSR and for a disconnected player. */
export function noSubmissionStorage<TAction>(): SubmissionStorage<TAction> {
	return {load: () => undefined, save: () => {}, clear: () => {}};
}

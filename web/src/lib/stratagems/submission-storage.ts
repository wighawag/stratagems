/**
 * Where stratagems' pending submission is kept between page loads: the base's
 * storage (`$lib/game/core/commit-reveal/storage`) in stratagems' FORMAT, the
 * two prefixes its records are written under and how a move is written.
 *
 * THE FORMAT IS A WIRE (AGENTS.md, "Commit-reveal rules"): the secret that opens
 * a commitment lives in this record and nowhere else, so once the game has
 * players a renamed prefix or a changed move encoding is every in-flight bond
 * forfeited, with every suite green. It was chosen once, here, on 2026-10-26
 * (step 6b), when no deployment of these contracts existed and so no record could
 * be in flight; the legacy client's `_account_*` records (alpha1's) are not read.
 * The key carries the chain, the game's address and the player, so a new
 * deployment starts with nothing to misread.
 */
import {
	createSubmissionStorage as createBaseSubmissionStorage,
	loadCommittedTurn as baseLoadCommittedTurn,
	submissionStorageKey as baseSubmissionStorageKey,
	type SubmissionStorageFormat,
} from '$lib/game/core/commit-reveal/storage';
import type {
	PersistedSubmission,
	SubmissionStorage,
} from '$lib/game/core/submission';
import type {GameIdentity} from '$lib/game/identity';
import type {Move} from './moves';

/** Stratagems' records: their prefixes, and a move as `[position, color]` strings. */
export const STRATAGEMS_STORAGE: SubmissionStorageFormat<Move> = {
	prefix: '__stratagems_submission__',
	committedPrefix: '__stratagems_committed_turn__',
	encode: (move) => [move.position.toString(), move.color],
	decode: (stored) => {
		const [position, color] = stored as [string, number];
		return {position: BigInt(position), color: Number(color)};
	},
};

/** Scoped to chain + contract + WHO PLAYS. */
export function submissionStorageKey(params: {
	chainID: string | number;
	gameAddress: string;
	player: GameIdentity;
}): string {
	return baseSubmissionStorageKey({
		...params,
		prefix: STRATAGEMS_STORAGE.prefix,
	});
}

/** A `SubmissionStorage` backed by localStorage. */
export function createSubmissionStorage(params: {
	key: string;
}): SubmissionStorage<Move> {
	return createBaseSubmissionStorage({...params, format: STRATAGEMS_STORAGE});
}

/** The last turn this browser committed for the player, if it still has it. */
export function loadCommittedTurn(
	submissionKey: string,
): PersistedSubmission<Move> | undefined {
	return baseLoadCommittedTurn(STRATAGEMS_STORAGE, submissionKey);
}

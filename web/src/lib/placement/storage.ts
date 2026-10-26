/**
 * Where this game's pending submission is kept between page loads.
 *
 * The storage is the base's client's (`$lib/game/core/commit-reveal/storage`);
 * what is this game's is the FORMAT below: the two prefixes its records are
 * written under, and how one placement is written.
 *
 * THE FORMAT IS A WIRE, and renaming anything in it is a decision rather than a
 * tidy-up. Once a game built on this template has users, renaming a prefix or
 * changing how a placement is written means `load()` cannot read what the
 * previous build wrote; it discards the record, and with it the secret that
 * opens a commitment in flight, which is the bond gone. The failure is silent
 * in the worst way: every suite stays green, because the tests are renamed
 * alongside the code and nothing reads a record written by an older build. It
 * would be found by a player, at their own expense.
 *
 * Renaming it here was free, and that was CHECKED rather than assumed: this
 * repo has no committed deployment records, so nothing is deployed and no
 * record can be in flight. A game built from this template starts at its own
 * first deploy and cannot hold a record written by a previous build of the
 * TEMPLATE, so it inherits this shape without inheriting the problem. Once that
 * game ships, this comment is the one to read before touching either name.
 */
import {
	committedTurnKey as baseCommittedTurnKey,
	createSubmissionStorage as createBaseSubmissionStorage,
	loadCommittedTurn as baseLoadCommittedTurn,
	noSubmissionStorage as baseNoSubmissionStorage,
	submissionStorageKey as baseSubmissionStorageKey,
	type SubmissionStorageFormat,
} from '$lib/game/core/commit-reveal/storage';
import type {
	PersistedSubmission,
	SubmissionStorage,
} from '$lib/game/core/submission';
import type {GameIdentity} from '$lib/game/identity';
import type {Placement} from './commit-reveal';

/** This game's records: their prefixes, and a cell id written as a string. */
export const PLACEMENT_STORAGE: SubmissionStorageFormat<Placement> = {
	prefix: '__placement_submission__',
	committedPrefix: '__placement_committed_turn__',
	// bigint has no JSON representation, so cell ids travel as strings.
	encode: (placement) => placement.cellID.toString(),
	decode: (cellID) => ({cellID: BigInt(cellID as string)}),
};

/** Scoped to chain + contract + WHO PLAYS. */
export function submissionStorageKey(params: {
	chainID: string | number;
	gameAddress: string;
	player: GameIdentity;
}): string {
	return baseSubmissionStorageKey({
		...params,
		prefix: PLACEMENT_STORAGE.prefix,
	});
}

/** A `SubmissionStorage` backed by localStorage. */
export function createSubmissionStorage(params: {
	key: string;
	onWriteFailure?: (error: unknown) => void;
}): SubmissionStorage<Placement> {
	return createBaseSubmissionStorage({...params, format: PLACEMENT_STORAGE});
}

/** Where the last COMMITTED turn is copied aside, beside a submission's key. */
export function committedTurnKey(submissionKey: string): string {
	return baseCommittedTurnKey(PLACEMENT_STORAGE, submissionKey);
}

/** The last turn this browser committed for the player, if it still has it. */
export function loadCommittedTurn(
	submissionKey: string,
): PersistedSubmission<Placement> | undefined {
	return baseLoadCommittedTurn(PLACEMENT_STORAGE, submissionKey);
}

/** A storage that keeps nothing, for SSR and for a disconnected player. */
export const noSubmissionStorage: SubmissionStorage<Placement> =
	baseNoSubmissionStorage<Placement>();

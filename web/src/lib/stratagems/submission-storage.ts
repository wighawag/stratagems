/**
 * Where stratagems' pending submission is kept between page loads: in the
 * account data (`createAccountDataSubmissionStorage`, step 8 item 4), so it is
 * synced and encrypted wherever the account data is, in stratagems' FORMAT, how
 * a move is written.
 *
 * THE FORMAT IS A WIRE (AGENTS.md, "Commit-reveal rules"): the secret that opens
 * a commitment lives in this record, so once the game has players a changed move
 * encoding is every in-flight bond forfeited, with every suite green. The record
 * moved from localStorage (`__stratagems_submission__`, step 6b) into the account
 * data on 2026-10-29, when no deployment of these contracts existed and so no
 * record could be in flight (they deploy at step D); the old keys are not read.
 * The account data's key carries the chain, the game's address and the player.
 */
import {
	createAccountDataSubmissionStorage,
	type AccountDataSubmissionStorage,
	type SubmissionAccountData,
	type SubmissionStorageFormat,
} from '$lib/game/core/commit-reveal/storage';
import type {GameIdentity} from '$lib/game/identity';
import type {Move} from './moves';

/** How a move is written: `[position, color]`, the position as a string. */
export const STRATAGEMS_STORAGE: SubmissionStorageFormat<Move> = {
	encode: (move) => [move.position.toString(), move.color],
	decode: (stored) => {
		const [position, color] = stored as [string, number];
		return {position: BigInt(position), color: Number(color)};
	},
};

/** Keyed by WHO PLAYS, which is what the contract's commitment is keyed by. */
export function createSubmissionStorage(params: {
	accountData: SubmissionAccountData;
	chainId: string | number;
	contract: `0x${string}`;
	player: GameIdentity;
}): AccountDataSubmissionStorage<Move> {
	return createAccountDataSubmissionStorage<Move, {}, GameIdentity>({
		accountData: params.accountData,
		format: STRATAGEMS_STORAGE,
		chainId: params.chainId,
		contract: params.contract,
		identity: params.player,
	});
}

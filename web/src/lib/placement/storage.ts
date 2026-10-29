/**
 * Where this game's pending submission is kept between page loads.
 *
 * The storage is the base's client's (`$lib/game/core/commit-reveal/storage`),
 * in the ACCOUNT DATA: the plan and every committed turn, synced and encrypted
 * wherever the account data is. What is this game's is the FORMAT below: how
 * one placement is written.
 *
 * THE FORMAT IS A WIRE, and changing it is a decision rather than a tidy-up.
 * Once a game built on this template has users, changing how a placement is
 * written means `load()` cannot read what the previous build wrote; it
 * discards the record, and with it the secret that opens a commitment in
 * flight, which is the bond gone. The failure is silent in the worst way: every
 * suite stays green, because the tests change alongside the code and nothing
 * reads a record written by an older build. It would be found by a player, at
 * their own expense.
 *
 * This game's records MOVED here from `localStorage` (step 8 of stratagems'
 * plan, P8), and the old keys (`__placement_submission__`,
 * `__placement_committed_turn__`) and their reader were deleted rather than
 * kept as a fallback. That was free, and CHECKED rather than assumed: this repo
 * has no committed deployment records (`git ls-files contracts/deployments` is
 * empty), so nothing is deployed and no record can be in flight. A game built
 * from this template starts at its own first deploy and inherits this shape
 * without inheriting the problem. Once that game ships, this comment is the one
 * to read before touching the format.
 */
import {
	createAccountDataSubmissionStorage,
	noSubmissionStorage as baseNoSubmissionStorage,
	type AccountDataSubmissionStorage,
	type SubmissionAccountData,
	type SubmissionStorageFormat,
} from '$lib/game/core/commit-reveal/storage';
import type {SubmissionStorage} from '$lib/game/core/submission';
import type {GameIdentity} from '$lib/game/identity';
import type {Placement} from './commit-reveal';

/** How this game writes a placement: its cell id as a string. */
export const PLACEMENT_STORAGE: SubmissionStorageFormat<Placement> = {
	// bigint has no JSON representation, so cell ids travel as strings.
	encode: (placement) => placement.cellID.toString(),
	decode: (cellID) => ({cellID: BigInt(cellID as string)}),
};

/** One identity's submission, in the account data. */
export function createSubmissionStorage(params: {
	accountData: SubmissionAccountData;
	chainId: string | number;
	contract: `0x${string}`;
	player: GameIdentity;
}): AccountDataSubmissionStorage<Placement> {
	return createAccountDataSubmissionStorage<Placement, {}, GameIdentity>({
		accountData: params.accountData,
		format: PLACEMENT_STORAGE,
		chainId: params.chainId,
		contract: params.contract,
		identity: params.player,
	});
}

/** A storage that keeps nothing, for SSR and for a disconnected player. */
export const noSubmissionStorage: SubmissionStorage<Placement> =
	baseNoSubmissionStorage<Placement>();

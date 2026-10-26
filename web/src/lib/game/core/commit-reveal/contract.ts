/**
 * THE CLIENT OF THE COMMIT-REVEAL BASE: what a game hands this module.
 *
 * Every game on this template keeps the commit-reveal base
 * (`contracts/src/commit-reveal/`), and the base's surface is the same in all
 * of them: `getCycle`, `getCycleNumber`, `getAttendance`, `advanceCycle`,
 * `getReserve`, `withdrawFromReserve`, `getCommitment`, `makeCommitment`,
 * `reveal`, `acknowledgeMissedReveal` and `forfeitMissedReveal`, under those
 * names, with those signatures. ONE THING DIFFERS between games, and it is the
 * action: the game's typed routes take `Placement[]` in one game and `Move[]`
 * in another (Solidity has no generics, so the base hands each game the digest
 * and a game keeps its own typed `reveal`).
 *
 * So the module is generic over the identity and the action, the way the
 * skeleton beside it is, and a game tells it three things: which contract
 * (its address and ABI), how its identity is spelled as the contract's
 * `uint256 player`, and the ABI components of one action, which is what the
 * commitment hash is taken over.
 */
import type {Abi, AbiParameter} from 'viem';
import type {PlayerIdentity} from '../seams';

/** The game's contract: the one that inherits the base and routes to it. */
export type CommitRevealContract = {
	address: `0x${string}`;
	abi: Abi;
};

/**
 * What a game's ACTION is, to the contract.
 *
 * `components` is the action struct's ABI, exactly as the game's `reveal`
 * declares it (`[{name: 'cellID', type: 'uint64'}]` for the reference game).
 * The action value itself is passed to viem as it is, so a game's action type
 * is the object viem encodes that struct from.
 *
 * It must match the game's Solidity digest exactly - same types, same order. A
 * mismatch is not a compile error and not a failed read: the commit succeeds,
 * and the reveal reverts with `CommitmentHashNotMatching` once the player's
 * stake is already bonded.
 */
export type ActionEncoding = {
	components: readonly AbiParameter[];
};

/**
 * How the game's identity is spelled as the base's `uint256 player`.
 *
 * Passed rather than imported, because this module is the framework and must
 * not name a game's identity (`test/identity-boundary.test.ts`). A game passes
 * `onchainIdentity` from `$lib/game/identity`, which is where its choice lives.
 */
export type OnchainIdentity<TIdentity extends PlayerIdentity> = (
	identity: TIdentity,
) => bigint;

/** What `getCommitment` returns: the head, its cycle, and what it bonds. */
export type CommitmentOnChain = {
	hash: `0x${string}`;
	cycleNumber: bigint;
	bond: bigint;
};

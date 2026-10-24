/**
 * A commit secret DERIVED from a key the player already holds, rather than
 * randomised.
 *
 * The framework's default secret is 32 random bytes (`randomSecret` in
 * `submission.ts`). It is safe, and it is unrecoverable: it exists only in
 * local storage, so a player who clears site data between the commit and the
 * reveal cannot open their own commitment. In a game with a stake that is not a
 * nuisance, it is the stake.
 *
 * A derived secret is a signature over a message that names the cycle, hashed.
 * The same key produces the same signature, so the secret can be recomputed on
 * another device, or in the same browser after its storage is gone.
 *
 * WHAT THIS DOES NOT RECOVER, and it is half the problem rather than a detail:
 * the ACTIONS. A commitment is `hash(secret, actions)` and the chain holds only
 * the hash, so the plan is not recoverable from anything here. Where a game's
 * action space is small enough it can be recovered by ENUMERATION once the
 * secret is in hand, and that is the game's own code because only the game
 * knows its space. Where it cannot, "recoverable" honestly means "a device that
 * still has the plan". See `games-on-this-foundation.md` D9 on the template's
 * `work` branch.
 */
import {encodePacked, keccak256} from 'viem';
import type {PlayerIdentity} from './seams.js';

/**
 * Sign a message with a key the player holds and keeps.
 *
 * Deliberately a function rather than a key: the framework never wants a
 * private key, and a caller may be signing through a wallet, a local account or
 * a remote signer without any of that being this module's business.
 *
 * It MUST be the same key on every device the player recovers from, which in
 * this template is the local signer: sign-in derives it from a signature over
 * an origin-scoped message the wallet produces locally, so the same account
 * derives the same signer anywhere. Signing with the ACCOUNT would be equally
 * recoverable and would cost a wallet prompt on every commit, which is the
 * thing the signer exists to remove.
 */
export type SignMessage = (message: string) => Promise<`0x${string}`>;

/**
 * Build the `makeSecret` a submission takes.
 *
 * The message is `Commit:<chainId>:<contract>:<identity>:<cycle>`, which names
 * every axis along which two secrets must differ.
 *
 * THE IDENTITY IS IN THE MESSAGE, and leaving it out is a real hole rather than
 * an omission. Where one account controls several identities (conquest's
 * empires), a message without it derives the SAME secret for all of them; a
 * small action space is enumerable against a known secret and a published hash,
 * so one of the player's own identities can open another's commitment, and so
 * can anyone else holding that secret. That enumeration is the same computation
 * a game uses to recover its own actions, and the only thing separating the two
 * is who holds the secret - which is exactly why the secret must not be shared
 * across identities.
 *
 * The chain id and the contract are in it for the ordinary reason: the same
 * cycle of the same game on another chain, or another deployment on the same
 * chain, is a different cycle.
 */
export function createDerivedSecret<TIdentity extends PlayerIdentity>(params: {
	sign: SignMessage;
	/** The chain the game is deployed on. */
	chainId: number | string;
	/** The game contract. For a routed game, the address the player calls. */
	contract: `0x${string}`;
}): (params: {
	cycleNumber: number;
	identity: TIdentity;
}) => Promise<`0x${string}`> {
	const {sign} = params;
	// NORMALISED ONCE, HERE, and this is the sharp edge of the whole module. The
	// message is a string, so any difference in spelling is a different
	// signature and therefore a different secret - and the failure is silent:
	// nothing throws, the commitment is simply one the player can no longer
	// open, and they find out when the reveal window closes on their stake. An
	// address is the one that will actually bite, because a checksummed literal
	// and a lowercased one are the same address and different text, and both
	// spellings are in circulation in every deployment file.
	const chainId = String(params.chainId);
	const contract = params.contract.toLowerCase();

	return async ({cycleNumber, identity}) => {
		const message = `Commit:${chainId}:${contract}:${identityToMessagePart(identity)}:${cycleNumber}`;
		// Hashed rather than used raw: a signature is 65 bytes and the commitment
		// wants 32, and hashing also means the secret is not itself a valid
		// signature over anything if it ever leaks.
		return keccak256(await sign(message));
	};
}

/**
 * The secret a PLAYED SEAT commits with, which is the same idea with a
 * different key situation.
 *
 * A HASH RATHER THAN A SIGNATURE, and that is the one difference from the
 * player's own above. A signature buys recovery from a key the player still
 * holds; the keys a played seat uses belong to whoever set the game up, so a
 * hash is the same guarantee with nothing to prompt and nothing to await.
 *
 * WHAT IT BUYS IS RECONSTRUCTION, NOT SECRECY, and it is worth being plain
 * about the difference. A played turn is a function of public inputs, so anybody
 * reading the game's own derivation can work out what these seats are about to
 * do. They are not hiding from the human, they are giving the cycle somebody to
 * wait for. What the derivation must never be is FORGOTTEN: a seat that commits
 * and then cannot reveal freezes a manual cycle for everybody, because no
 * advance closes a cycle holding an unopened commitment and a missed reveal from
 * the CURRENT cycle cannot be settled either.
 *
 * THE DOMAIN SEPARATION IS STILL LOAD-BEARING, for a different reason from the
 * one above: two seats deriving one secret would be two commitments either of
 * them could open, which is a way for one played seat to settle another's turn
 * by accident.
 *
 * AND THE WHOLE INPUT LIST IS A WIRE. Change any part of it and a commitment an
 * earlier build left on chain can no longer be opened - see the paragraph above
 * for what that costs under a manual cycle. Treat it the way `AGENTS.md` treats a
 * persisted storage key.
 *
 * The identity is a `bigint` because that is the one spelling both shapes reach:
 * an address widened, or a token id. A game with an address identity widens it
 * at the call site rather than making this function ask.
 */
export function playedSeatSecret(params: {
	chainId: number;
	/** The game contract. For a routed game, the address the seat calls. */
	contract: `0x${string}`;
	identity: bigint;
	cycleNumber: number;
}): `0x${string}` {
	return keccak256(
		encodePacked(
			['string', 'uint256', 'address', 'uint256', 'uint64'],
			[
				'PlayedSeat:secret',
				BigInt(params.chainId),
				params.contract,
				params.identity,
				BigInt(params.cycleNumber),
			],
		),
	);
}

/**
 * How an identity is spelled in the message.
 *
 * Both shapes of `PlayerIdentity` get one canonical spelling, for the reason
 * above: a bigint has exactly one decimal form, and an address is lowercased so
 * that a checksummed one and a lowercased one agree. A game with an identity
 * type of its own passes it through here as one of the two.
 */
function identityToMessagePart(identity: PlayerIdentity): string {
	return typeof identity === 'bigint'
		? identity.toString(10)
		: identity.toLowerCase();
}

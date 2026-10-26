/**
 * THE HASH CHAIN a turn is committed as, for any action type.
 *
 * The base has ONE encoding, `bytes24(keccak256(abi.encode(secret, actions,
 * furtherActions)))`, and the client has one too, here. The game supplies only
 * the ABI components of its action (see {@link ActionEncoding}).
 */
import {encodeAbiParameters, keccak256} from 'viem';
import type {ActionEncoding} from './contract';

/**
 * `bytes24(keccak256(...))`: the contract stores 24 bytes, so the client must
 * truncate the same way. 2 characters for `0x` plus 48 hex digits.
 */
const BYTES24_HEX_LENGTH = 50;

/** `bytes24(0)`: what a chunk carries when there is nothing after it. */
export const NO_FURTHER_ACTIONS =
	'0x000000000000000000000000000000000000000000000000' as const;

/** One reveal transaction's worth of a turn, and what it promises after it. */
export type CommitmentChunk<TAction> = {
	actions: readonly TAction[];
	/** The hash of the chunk after this one, or {@link NO_FURTHER_ACTIONS}. */
	furtherActions: `0x${string}`;
	/** The head this chunk opens, which is what the contract will be holding. */
	hash: `0x${string}`;
	/** The bytes that hash is taken over, kept for the same reason it always was. */
	encoded: `0x${string}`;
};

/**
 * The ABI the commitment hash is taken over.
 *
 * THE TRAILING `bytes24` IS THE NEXT CHUNK'S HASH, and it is part of the
 * encoding for EVERY chunk including the last, where it is zero. The contract
 * has one encoding for the same reason this file does: a second one, selected
 * by a branch on the very value that tells the last chunk from the rest, is a
 * second chance to get the one thing wrong that costs a player money.
 */
function commitmentAbi(encoding: ActionEncoding) {
	return [
		{type: 'bytes32'},
		{type: 'tuple[]', components: encoding.components},
		{type: 'bytes24'},
	] as const;
}

/**
 * Cut a turn into the pieces the contract will accept.
 *
 * EXACTLY FULL EXCEPT THE LAST, which is the contract's rule and not a
 * convenience: a chunk that promises a successor and is not full is refused, so
 * a client that padded, trimmed or balanced the pieces would build a chain no
 * reveal past the first could follow.
 *
 * An EMPTY turn is still one chunk. It is committed, it is revealed, and it
 * resolves to nothing - which is what an idle player's automatic turn is in a
 * game that punishes silence. Without this it would have no head to commit.
 */
function cutIntoChunks<TAction>(
	actions: readonly TAction[],
	actionsPerReveal: number,
): TAction[][] {
	if (!Number.isInteger(actionsPerReveal) || actionsPerReveal < 1) {
		throw new Error(
			`this deployment says ${actionsPerReveal} actions per reveal, which is not a turn anybody could open`,
		);
	}
	const chunks: TAction[][] = [];
	for (let i = 0; i < actions.length; i += actionsPerReveal) {
		chunks.push(actions.slice(i, i + actionsPerReveal));
	}
	if (chunks.length === 0) chunks.push([]);
	return chunks;
}

/**
 * Build the chain.
 *
 * A commitment is not the hash of a turn; it is the head of a chain. Each
 * reveal opens one chunk and rewrites the head to the hash of the next, and the
 * commitment stays open until a chunk arrives declaring none. So the hashes are
 * computed from the LAST chunk BACKWARDS: the head cannot be known until
 * everything that comes after it is.
 *
 * Returns the chain in submission order, so `chunks[0]` is what the first reveal
 * sends and `chunks[0].hash` is the head that was committed.
 */
export function buildCommitmentChain<TAction>(params: {
	actions: readonly TAction[];
	secret: `0x${string}`;
	actionsPerReveal: number;
	encoding: ActionEncoding;
}): CommitmentChunk<TAction>[] {
	const cut = cutIntoChunks(params.actions, params.actionsPerReveal);
	const abi = commitmentAbi(params.encoding);

	const chain: CommitmentChunk<TAction>[] = [];
	let furtherActions: `0x${string}` = NO_FURTHER_ACTIONS;
	for (let i = cut.length - 1; i >= 0; i--) {
		// The action is viem's own input for the struct the game declared; viem
		// cannot type that from components only known at run time.
		const encoded = encodeAbiParameters(abi, [
			params.secret,
			cut[i] as never,
			furtherActions,
		]);
		const hash = keccak256(encoded).slice(
			0,
			BYTES24_HEX_LENGTH,
		) as `0x${string}`;
		chain.unshift({actions: cut[i], furtherActions, hash, encoded});
		furtherActions = hash;
	}
	return chain;
}

/**
 * The commitment for a whole turn: the head of its chain.
 *
 * TAKES THE CHUNK SIZE, because the head depends on it. The same actions and
 * the same secret hash to a DIFFERENT head at a different chunk size, so this
 * cannot be a free function over two arguments the way it was before chaining -
 * anything that recomputes a commitment (the recovery check, most of all) has to
 * be given the deployment's number rather than assume one.
 */
export function buildChainedCommitment<TAction>(params: {
	actions: readonly TAction[];
	secret: `0x${string}`;
	actionsPerReveal: number;
	encoding: ActionEncoding;
}): {hash: `0x${string}`; encoded: `0x${string}`} {
	const chain = buildCommitmentChain(params);
	return {hash: chain[0].hash, encoded: chain[0].encoded};
}

/**
 * Where in the chain the contract currently is.
 *
 * READ OFF THE CHAIN, NEVER REMEMBERED. A reveal interrupted halfway - a
 * reload, a signer that ran out of gas between chunks, a second device - leaves
 * the browser with no idea how far it got, and a browser that guessed would
 * either re-send a chunk that has already landed (refused, because the head has
 * moved past it) or skip one (refused, for the same reason). The contract is
 * holding the answer: its `hash` is the head, and the head identifies exactly
 * one chunk of a chain this client can rebuild.
 *
 * Returns the index of the chunk that is due next, or undefined when the head
 * belongs to no chunk of this turn - which means the commitment on chain is not
 * this submission's, and re-sending against it would be sending somebody else's
 * turn.
 */
export function chunkDueNext(
	chain: readonly {hash: `0x${string}`}[],
	head: `0x${string}`,
): number | undefined {
	// Lowercased on both sides: hex case is a difference no error anywhere would
	// report, and the same normalisation `game/core/recovery` does for the same
	// reason.
	const wanted = head.toLowerCase();
	const index = chain.findIndex((chunk) => chunk.hash.toLowerCase() === wanted);
	return index === -1 ? undefined : index;
}

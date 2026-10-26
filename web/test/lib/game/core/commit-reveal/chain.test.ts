import {describe, expect, it} from 'vitest';
import {encodeAbiParameters, keccak256} from 'viem';
import {
	buildChainedCommitment,
	buildCommitmentChain,
	chunkDueNext,
	NO_FURTHER_ACTIONS,
} from '$lib/game/core/commit-reveal/chain';
import type {ActionEncoding} from '$lib/game/core/commit-reveal/contract';

/**
 * The chain, for an action that is NOT the reference game's.
 *
 * The reference game's `Placement` is one `uint64`, which is the easiest
 * struct there is to get right by accident. A move with two fields of
 * different widths is what a second game on the base actually commits (it is
 * stratagems' `Move`), so the encoding is pinned against the base's one digest
 * computed independently here: `bytes24(keccak256(abi.encode(secret, actions,
 * furtherActions)))`.
 */
type Move = {position: bigint; color: number};

const MOVE: ActionEncoding = {
	components: [
		{name: 'position', type: 'uint64'},
		{name: 'color', type: 'uint8'},
	],
};

const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000aa' as const;

const moves = (n: number): Move[] =>
	Array.from({length: n}, (_, i) => ({position: BigInt(i + 1), color: i % 5}));

/** The base's digest, written out by hand rather than through the module. */
function digest(
	actions: readonly Move[],
	furtherActions: `0x${string}`,
): `0x${string}` {
	const encoded = encodeAbiParameters(
		[
			{type: 'bytes32'},
			{
				type: 'tuple[]',
				components: [
					{name: 'position', type: 'uint64'},
					{name: 'color', type: 'uint8'},
				],
			},
			{type: 'bytes24'},
		],
		[SECRET, actions as Move[], furtherActions],
	);
	return keccak256(encoded).slice(0, 50) as `0x${string}`;
}

describe('the commitment chain, for a second action type', () => {
	it('hashes a one-chunk turn exactly as the base digests it', () => {
		const actions = moves(3);
		const {hash} = buildChainedCommitment({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
			encoding: MOVE,
		});
		expect(hash).toBe(digest(actions, NO_FURTHER_ACTIONS));
	});

	it('chains from the last chunk backwards, every chunk full but the last', () => {
		const actions = moves(5);
		const chain = buildCommitmentChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 2,
			encoding: MOVE,
		});
		expect(chain.map((chunk) => chunk.actions.length)).toEqual([2, 2, 1]);

		const last = digest(actions.slice(4), NO_FURTHER_ACTIONS);
		const middle = digest(actions.slice(2, 4), last);
		const head = digest(actions.slice(0, 2), middle);
		expect(chain.map((chunk) => chunk.hash)).toEqual([head, middle, last]);
		expect(chain.map((chunk) => chunk.furtherActions)).toEqual([
			middle,
			last,
			NO_FURTHER_ACTIONS,
		]);
	});

	it('commits an empty turn as one empty chunk', () => {
		const chain = buildCommitmentChain<Move>({
			actions: [],
			secret: SECRET,
			actionsPerReveal: 2,
			encoding: MOVE,
		});
		expect(chain).toHaveLength(1);
		expect(chain[0].hash).toBe(digest([], NO_FURTHER_ACTIONS));
	});

	it('gives a different head at a different chunk size', () => {
		const actions = moves(4);
		const at = (actionsPerReveal: number) =>
			buildChainedCommitment({
				actions,
				secret: SECRET,
				actionsPerReveal,
				encoding: MOVE,
			}).hash;
		expect(at(2)).not.toBe(at(4));
	});

	it('refuses a chunk size nobody could open', () => {
		expect(() =>
			buildCommitmentChain({
				actions: moves(1),
				secret: SECRET,
				actionsPerReveal: 0,
				encoding: MOVE,
			}),
		).toThrow(/actions per reveal/);
	});

	it('finds the chunk a head is due at, whatever its case, and no other', () => {
		const chain = buildCommitmentChain({
			actions: moves(5),
			secret: SECRET,
			actionsPerReveal: 2,
			encoding: MOVE,
		});
		expect(chunkDueNext(chain, chain[1].hash.toUpperCase() as never)).toBe(1);
		expect(chunkDueNext(chain, NO_FURTHER_ACTIONS)).toBeUndefined();
	});
});

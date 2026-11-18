import {describe, expect, it} from 'vitest';
import {mintChainId} from '$lib/embedded/chain-id';
import {boardWorker} from '$lib/stratagems/board/indexed-board';

/**
 * WHICH WORKER FOLDS STRATAGEMS' BOARD. jolly-roger's `worker-choice.ts`
 * (template-commit-reveal's `upstream/with/indexer`) calls no chain a world
 * unless the app says which are, so stratagems passes `isEmbeddedChainId`:
 * without it the offline world's board would be folded by the live worker,
 * under a tab election, looking for a publication a world never has.
 */
const STRATAGEMS = '0x00000000000000000000000000000000000000Aa' as const;

function deployment(id: number) {
	return {chain: {id}, contracts: {Stratagems: {address: STRATAGEMS}}} as never;
}

describe("stratagems' board worker", () => {
	it('an offline world (a chain in this tab) is folded by the world worker', () => {
		const id = mintChainId(() => 0.5);
		expect(boardWorker(deployment(id))).toEqual({
			kind: 'world',
			name: `stratagems-world-${id}`,
		});
	});

	it('a live chain is folded by the live worker', () => {
		expect(boardWorker(deployment(31337)).kind).toBe('live');
	});
});

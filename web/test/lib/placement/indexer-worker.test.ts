import {describe, expect, it} from 'vitest';
import {mintChainId} from '$lib/embedded/chain-id';
import {boardWorker} from '$lib/placement/indexer/board';
import type {ContractsInfo} from '$lib/placement/indexer/source';

/**
 * WHICH WORKER FOLDS THE REFERENCE GAME'S BOARD. jolly-roger's
 * `worker-choice.ts` (`upstream/with/indexer`) calls no chain a world unless
 * the app says which are, so this game passes `isEmbeddedChainId`: without it
 * the offline world's board would be folded by the live worker, under a tab
 * election, with no world database to forget when the world is.
 */
const GAME = '0x00000000000000000000000000000000000000Aa' as const;

function deployments(id: number): ContractsInfo {
	return {chain: {id}, contracts: {Game: {address: GAME, abi: []}}} as never;
}

describe("the reference game's board worker", () => {
	it('an offline world (a chain in this tab) is folded by the world worker', () => {
		const id = mintChainId(() => 0.5);
		expect(boardWorker(deployments(id))).toEqual({
			kind: 'world',
			name: `placement-world-${id}`,
		});
	});

	it('a live chain is folded by the live worker', () => {
		expect(boardWorker(deployments(31337)).kind).toBe('live');
	});
});

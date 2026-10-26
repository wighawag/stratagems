import {describe, expect, it} from 'vitest';
import {
	bondForWholeChunks,
	resolveCommitRevealConfig,
	signerStipend,
} from '$lib/game/core/commit-reveal/config';

/**
 * The base's half of a game's config, read off `linkedData` with no game in
 * it: no placement cost, no sale. A second game declares these keys and
 * nothing of the reference game's.
 */
const declared = {
	startTime: '0',
	commitPhaseDuration: '30',
	revealPhaseDuration: '10',
	cyclePolicy: '0',
	actionsPerReveal: '32',
	expectedActionsPerTurn: '8',
	commitGas: '150000',
	revealGas: '600000',
	tokens: '0x0000000000000000000000000000000000000002',
};

describe("the base's config", () => {
	it('reads what every game on the base declares, and nothing of a game', () => {
		const config = resolveCommitRevealConfig(declared);
		expect(config.actionsPerReveal).toBe(32);
		expect(config.expectedActionsPerTurn).toBe(8);
		expect(config.gas).toEqual({commit: 150000n, reveal: 600000n});
		expect(config.tokenAddress).toBe(declared.tokens);
		expect(config.cycle.revealPhaseDuration).toBe(10);
	});

	it('refuses a deployment that does not declare its gas', () => {
		const {revealGas: _omitted, ...withoutRevealGas} = declared;
		void _omitted;
		expect(() =>
			resolveCommitRevealConfig(withoutRevealGas as never),
		).toThrow();
	});

	it('sizes the stipend in expected turns, and gives none without a price', () => {
		const config = resolveCommitRevealConfig(declared);
		// One commit and one reveal per expected turn (8 actions fit one chunk
		// of 32), a hundred turns, at a price of 1 wei.
		expect(signerStipend(config, 1n)).toBe((150000n + 600000n) * 100n);
		expect(signerStipend(config, 0n)).toBe(0n);
	});
});

describe('a whole-chunk bond, for a game with its own cost per action', () => {
	// A cost that is not a multiple of anything the reference game uses.
	const costOf = (count: number) => 7n * BigInt(count);

	it('rounds the cost up to whole chunks', () => {
		expect(bondForWholeChunks({costOf, actionsPerReveal: 4, count: 5})).toBe(
			costOf(8),
		);
	});

	it('caps at the reserve, and never below the cost', () => {
		expect(
			bondForWholeChunks({costOf, actionsPerReveal: 4, count: 5, reserve: 50n}),
		).toBe(50n);
		expect(
			bondForWholeChunks({costOf, actionsPerReveal: 4, count: 5, reserve: 20n}),
		).toBe(costOf(5));
	});

	it('bonds nothing for an empty turn', () => {
		expect(bondForWholeChunks({costOf, actionsPerReveal: 4, count: 0})).toBe(
			0n,
		);
	});
});

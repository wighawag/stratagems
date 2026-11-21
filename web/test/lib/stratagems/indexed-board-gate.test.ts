import {describe, expect, it, vi} from 'vitest';
import {readable, writable} from 'svelte/store';

/**
 * STRATAGEMS' BOARD WAITS FOR THE CHAIN, as the skeleton's poller it replaces
 * does (`fetchGate: core.chainFetchGate`): the board hands the framework's
 * indexed state the gate it is given, and the indexed state starts nothing
 * while it is closed (`test/lib/indexer/indexed-state.test.ts` pins that half).
 * Without it the board started at its first subscriber, before the chain could
 * be read, and its first reads failed like a broken RPC.
 *
 * The indexed state is faked, so this is the board's half only: what it passes.
 */
const handed = vi.hoisted(() => ({gates: [] as unknown[]}));

vi.mock('$lib/indexer', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/indexer')>()),
	createIndexedState: (options: {gate?: unknown}) => {
		handed.gates.push(options.gate);
		return {subscribe: readable({step: 'Unloaded'}).subscribe};
	},
}));

// What is indexed is not under test here, and reads a whole deployment.
vi.mock('stratagems-indexer', async (importOriginal) => ({
	...(await importOriginal<typeof import('stratagems-indexer')>()),
	indexingSource: () => ({}),
}));

const {createIndexedBoard} =
	await import('$lib/stratagems/board/indexed-board');

const STRATAGEMS = '0x00000000000000000000000000000000000000Aa' as const;

describe("stratagems' indexed board", () => {
	it("hands the indexed state its gate (the app's chainFetchGate)", () => {
		const gate = writable(false);
		createIndexedBoard({
			provider: {} as never,
			publicClient: {} as never,
			deployment: {
				name: 'localhost',
				chain: {id: 31337},
				contracts: {Stratagems: {address: STRATAGEMS, startBlock: 0}},
			} as never,
			cycleConfig: {} as never,
			player: readable(undefined),
			appPath: (path) => path,
			gate,
		} as Parameters<typeof createIndexedBoard>[0]);
		expect(handed.gates).toEqual([gate]);
	});
});

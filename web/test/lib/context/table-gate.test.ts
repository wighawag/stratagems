import {describe, it, expect, vi} from 'vitest';
import {get} from 'svelte/store';
import {
	createContextOpening,
	tableReaderFor,
	type ContextOpening,
} from '$lib/context/table-gate';
import type {ResolvedTable} from '$lib/game/lobby/table';

/**
 * THE TABLE GATE: a page at no table gets its context at once (and on the
 * server, where no query exists, so prerendering is untouched); a page at a
 * table gets it only once the table is resolved, composed at the table with
 * the block it was created in, or is told what is wrong instead.
 */

const TABLE = '0x1111111111111111111111111111111111111111' as const;
const IMPLEMENTATION = '0x2222222222222222222222222222222222222222' as const;

type Composed = {table?: ResolvedTable};

async function settled<C>(store: {
	subscribe: (run: (value: ContextOpening<C>) => void) => () => void;
}): Promise<ContextOpening<C>> {
	await vi.waitFor(() => {
		if (get(store).step === 'Opening') throw new Error('still opening');
	});
	return get(store);
}

describe('the table gate', () => {
	it('composes a page at no table at once, synchronously, without reading the chain', () => {
		const compose = vi.fn((table?: ResolvedTable): Composed => ({table}));
		const reader = vi.fn();
		const opening = createContextOpening({
			table: undefined,
			implementation: () => IMPLEMENTATION,
			reader,
			compose,
		});
		expect(get(opening)).toEqual({step: 'Ready', context: {table: undefined}});
		expect(compose).toHaveBeenCalledTimes(1);
		expect(reader).not.toHaveBeenCalled();
	});

	it('composes a table only once it is resolved, at the block it was created in', async () => {
		const compose = vi.fn((table?: ResolvedTable): Composed => ({table}));
		const resolve = vi.fn(async () => ({
			kind: 'table' as const,
			table: {address: TABLE, openedAtBlock: 99},
		}));
		const opening = createContextOpening({
			table: TABLE,
			implementation: () => IMPLEMENTATION,
			reader: async () => ({}) as never,
			compose,
			resolve,
		});
		expect(get(opening)).toEqual({step: 'Opening', address: TABLE});
		expect(compose).not.toHaveBeenCalled();
		expect(await settled(opening)).toEqual({
			step: 'Ready',
			context: {table: {address: TABLE, openedAtBlock: 99}},
		});
		expect(resolve).toHaveBeenCalledWith({}, TABLE, IMPLEMENTATION);
		expect(compose).toHaveBeenCalledTimes(1);
	});

	it('composes nothing at an address that is not a table, and says why', async () => {
		const compose = vi.fn();
		const opening = createContextOpening({
			table: TABLE,
			implementation: () => IMPLEMENTATION,
			reader: async () => ({}) as never,
			compose,
			resolve: async () => ({
				kind: 'not-a-table',
				address: TABLE,
				reason: 'There is no contract at this address.',
			}),
		});
		expect(await settled(opening)).toEqual({
			step: 'NotATable',
			address: TABLE,
			reason: 'There is no contract at this address.',
		});
		expect(compose).not.toHaveBeenCalled();
	});

	it('says the chain could not be read, and reads it again when asked', async () => {
		let attempts = 0;
		const opening = createContextOpening({
			table: TABLE,
			implementation: () => IMPLEMENTATION,
			reader: async () => ({}) as never,
			compose: (table?: ResolvedTable): Composed => ({table}),
			resolve: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error('fetch failed');
				return {kind: 'table', table: {address: TABLE, openedAtBlock: 5}};
			},
		});
		expect(await settled(opening)).toEqual({
			step: 'Unreachable',
			address: TABLE,
			message: 'fetch failed',
		});
		opening.retry();
		expect(await settled(opening)).toMatchObject({step: 'Ready'});
		expect(attempts).toBe(2);
	});
});

describe("the gate's reader", () => {
	it("reads with the app's own node when it has one", async () => {
		const reader = await tableReaderFor({
			nodeURL: 'http://127.0.0.1:1',
			chain: {id: 31337},
		});
		expect(typeof reader.getCode).toBe('function');
		expect(typeof reader.readContract).toBe('function');
	});

	it("falls back to the browser's wallet, only on the deployment's chain", async () => {
		const injected = {request: vi.fn(async () => '0x7a69')};
		const reader = await tableReaderFor({
			nodeURL: undefined,
			chain: {id: 31337},
			injected: injected as never,
		});
		expect(typeof reader.getCode).toBe('function');
		await expect(
			tableReaderFor({
				nodeURL: undefined,
				chain: {id: 8453},
				injected: injected as never,
			}),
		).rejects.toThrow(/chain 31337; this table is on chain 8453/);
	});

	it('says so when there is nothing to read with', async () => {
		await expect(
			tableReaderFor({nodeURL: undefined, chain: {id: 1}}),
		).rejects.toThrow(/no node of its own/);
	});
});

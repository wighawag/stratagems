/**
 * THE GATE A TABLE'S PAGE OPENS THROUGH: the table is resolved BEFORE its
 * context is composed (`$lib/game/lobby/table`'s `resolveTable`), so the
 * deployment record the context is built on is true of the table (its
 * `startBlock` the block it was created in, not its implementation's
 * deployment) and a link to anything that is not one of this game's tables is
 * refused before a single control exists.
 *
 * ONLY A TABLE WAITS. A page at no table (and every page on the server, where
 * there is no query, so no table) is `Ready` at once, with the context built
 * synchronously exactly as before, which is what lets a page prerender instead
 * of waiting behind a splash (ADR-0002, jolly-roger's `work`). A table is
 * `?game=<address>`, which only a browser ever sees.
 *
 * The chain is read before the connection exists, so the gate brings its own
 * reader: the app's node when it has one (the URL the core resolves, the
 * same-host notation included), else the browser's injected wallet when it is
 * on the deployment's chain (an `eth_call` asks for no account), else nothing,
 * which it says.
 */
import {writable, type Readable} from 'svelte/store';
import {createPublicClient, custom, http, type EIP1193Provider} from 'viem';
import {
	resolveTable,
	type ResolvedTable,
	type TableResolution,
} from '$lib/game/lobby/table';
import {resolveAppRpcUrl} from '$lib/core/connection/rpc-config.js';

/** What the gate reads a table with: the two calls `resolveTable` makes. */
export type TableReader = Parameters<typeof resolveTable>[0];

export type ContextOpening<C> =
	| {step: 'Ready'; context: C}
	| {step: 'Opening'; address: `0x${string}`}
	| {step: 'NotATable'; address: `0x${string}`; reason: string}
	| {step: 'Unreachable'; address: `0x${string}`; message: string};

export type ContextOpeningStore<C> = Readable<ContextOpening<C>> & {
	/** Read the table again, after `Unreachable`. */
	retry(): void;
};

/**
 * The context of this page, once it can be composed.
 *
 * @param params.table the table this page is at, if any (`?game=`)
 * @param params.compose builds the context, at the resolved table or at none;
 *        called once, synchronously when there is no table
 */
export function createContextOpening<C>(params: {
	table: `0x${string}` | undefined;
	/** The game's lobby implementation, which a table's code must clone. */
	implementation: () => `0x${string}`;
	/** The reader, or why there is none (a sentence for the player). */
	reader: () => Promise<TableReader>;
	compose: (table?: ResolvedTable) => C;
	/** For a test: what resolves the table. */
	resolve?: typeof resolveTable;
}): ContextOpeningStore<C> {
	const {table} = params;
	if (table === undefined) {
		const ready = writable<ContextOpening<C>>({
			step: 'Ready',
			context: params.compose(),
		});
		return {subscribe: ready.subscribe, retry() {}};
	}
	const resolve = params.resolve ?? resolveTable;
	const state = writable<ContextOpening<C>>({step: 'Opening', address: table});
	let opening = false;
	let composed = false;

	async function open() {
		if (opening || composed) return;
		opening = true;
		state.set({step: 'Opening', address: table!});
		let resolution: TableResolution;
		try {
			const reader = await params.reader();
			resolution = await resolve(reader, table!, params.implementation());
		} catch (error) {
			opening = false;
			state.set({
				step: 'Unreachable',
				address: table!,
				message: messageOf(error),
			});
			return;
		}
		opening = false;
		if (resolution.kind === 'not-a-table') {
			state.set({
				step: 'NotATable',
				address: resolution.address,
				reason: resolution.reason,
			});
			return;
		}
		composed = true;
		state.set({step: 'Ready', context: params.compose(resolution.table)});
	}

	void open();
	return {subscribe: state.subscribe, retry: () => void open()};
}

/**
 * THE GATE'S READER: the app's own node when it has one, else the injected
 * wallet on the deployment's chain. Rejects with a sentence otherwise.
 */
export async function tableReaderFor(params: {
	/** The app's node, already resolved against the page (`resolveURLForThisPage`). */
	nodeURL: string | undefined;
	chain: {id: number; rpcUrls?: {default?: {http?: readonly string[]}}};
	/** The browser's injected wallet, if any (`window.ethereum`). */
	injected?: EIP1193Provider;
}): Promise<TableReader> {
	const url = resolveAppRpcUrl(
		params.nodeURL,
		params.chain.rpcUrls?.default?.http,
	);
	if (url) {
		return createPublicClient({transport: http(url)}) as unknown as TableReader;
	}
	const injected = params.injected;
	if (!injected) {
		throw new Error(
			'This app has no node of its own to read the table from, and no wallet was found in this browser.',
		);
	}
	const chainId = Number(
		await injected.request({method: 'eth_chainId'} as never),
	);
	if (chainId !== params.chain.id) {
		throw new Error(
			`Your wallet is on chain ${chainId}; this table is on chain ${params.chain.id}. Switch it, then try again.`,
		);
	}
	return createPublicClient({
		transport: custom(injected),
	}) as unknown as TableReader;
}

function messageOf(error: unknown): string {
	if (error && typeof error === 'object' && 'shortMessage' in error) {
		return String((error as {shortMessage: unknown}).shortMessage);
	}
	return error instanceof Error ? error.message : String(error);
}

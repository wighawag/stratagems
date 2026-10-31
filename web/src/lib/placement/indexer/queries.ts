/**
 * THE QUESTIONS THE BOARD ASKS of the reference game's indexed state, as
 * GraphQL over the schema etherfold builds from `./processor.ts`'s entities,
 * and the code that turns the answers into the board the game draws.
 *
 * Two PARTS, each one question, for `$lib/indexer`'s follower:
 *
 *   cells          every cell, its total stake and its claimant count  (`cell`)
 *   advancedCycle  the cycle the last push left, if any                (`advancedCycle`)
 *
 * The `claim` rows are the processor's own bookkeeping and nothing reads them.
 */
import {
	StateQueryError,
	type BlockRef,
	type Execute,
	type StateFollowerSpec,
	type StateRead,
} from '$lib/indexer';
import type {Cell} from '$lib/placement/state';
import {SINGLETON} from './processor';

/** What the indexed state holds, as the game computes with it. */
export type IndexedBoard = {
	cells: Map<bigint, Cell>;
	/** The cycle the last `CycleAdvanced` left (undefined before the first). */
	advancedCycle?: number;
};

export const emptyIndexedBoard = (): IndexedBoard => ({cells: new Map()});

export type Part = 'cells' | 'advancedCycle';

/**
 * How many rows a list asks for. A CAP, not a cost: a list that comes back
 * FULL is refused rather than taken as the whole set, because GraphQL's
 * `first` cuts silently.
 */
export const LIST_LIMIT = 20_000;

function rootField(part: Part, pinned: boolean): string {
	const at = pinned ? ', block: $block' : '';
	switch (part) {
		case 'cells':
			return `cell(first: ${LIST_LIMIT}${at}) { cellID totalStake numClaimants }`;
		case 'advancedCycle':
			return `advancedCycle(where: {id: {eq: "${SINGLETON.id}"}}, first: 1${at}) { cycleNumber }`;
	}
}

const PARTS: readonly Part[] = ['cells', 'advancedCycle'];

/** One document asking the given parts, every root field as of one block (`$block`) or the tip. */
export function boardDocument(parts: Iterable<Part>, pinned: boolean): string {
	const wanted = new Set(parts);
	const fields = PARTS.filter((part) => wanted.has(part)).map((part) =>
		rootField(part, pinned),
	);
	return `query PlacementBoard${pinned ? '($block: BlockAddress!)' : ''} {\n\t${fields.join('\n\t')}\n}`;
}

type Row = Record<string, unknown>;

/** Ask some parts as of one block (the tip when `at` is left out), written into a copy of `into`. */
export async function readBoard(
	execute: Execute,
	parts: ReadonlySet<Part>,
	options: {at?: number | BlockRef; into?: IndexedBoard} = {},
): Promise<StateRead<IndexedBoard>> {
	const at = options.at;
	const result = await execute({
		query: boardDocument(parts, at !== undefined),
		variables:
			at === undefined
				? {}
				: {block: typeof at === 'number' ? {number: at} : {hash: at.hash}},
	});
	if (result.errors && result.errors.length > 0) {
		const first = result.errors[0];
		const code =
			typeof first.extensions?.code === 'string'
				? first.extensions.code
				: undefined;
		throw new StateQueryError(
			`${code ? `${code}: ` : ''}${first.message}`,
			code,
		);
	}
	const answer = result.data as Record<string, Row[]>;
	const data: IndexedBoard = options.into
		? {...options.into}
		: emptyIndexedBoard();
	if (parts.has('cells')) {
		const rows = answer.cell;
		if (rows.length >= LIST_LIMIT) {
			throw new StateQueryError(
				`the cells answered ${rows.length} rows, the limit asked for: a cut list is not the whole board`,
				'list-limit-reached',
			);
		}
		data.cells = new Map();
		for (const row of rows) {
			const id = BigInt(row.cellID as string);
			data.cells.set(id, {
				cellID: id,
				// a `u256` crosses as a decimal string (JSON has no bigint)
				totalStake: BigInt(row.totalStake as string),
				numClaimants: Number(row.numClaimants),
			});
		}
	}
	if (parts.has('advancedCycle')) {
		const row = answer.advancedCycle[0];
		data.advancedCycle = row ? Number(row.cycleNumber) : undefined;
	}
	// Pinned, the fields are as of `at`; unpinned, as of the operation's pin.
	if (at !== undefined && typeof at !== 'number') {
		return {
			data,
			block: at.number,
			blockHash: at.hash,
			generation: result.extensions?.generation,
		};
	}
	return {
		data,
		block: at ?? result.extensions?.block ?? undefined,
		blockHash:
			at === undefined
				? (result.extensions?.blockHash ?? undefined)
				: undefined,
		generation: result.extensions?.generation,
	};
}

/** The board, for `$lib/indexer`'s follower. No part depends on who plays. */
export const boardFollower: StateFollowerSpec<Part, IndexedBoard> = {
	parts: PARTS,
	partOf: {cell: 'cells', claim: 'cells', advancedCycle: 'advancedCycle'},
	read: (execute, parts, {at, into}) => readBoard(execute, parts, {at, into}),
};

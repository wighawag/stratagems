/**
 * THE QUESTIONS THE WEB APP ASKS, as GraphQL documents over the schema etherfold
 * builds from `./entities.ts` (etherfold ADR-0098, ADR-0099), and the one function
 * that turns their answer into the shape the app computes with (`Data`).
 *
 * One module for every reader, so what is checked is what runs:
 *
 * - `web/` runs these documents against its worker (`workerExecutor`), and re-runs
 *   them when the state moves;
 * - `oracle/2026-09-29-alpha1/compare.ts` runs the same documents against the
 *   database `etherfold build` folded (`httpExecutor` over `etherfold serve`) and
 *   compares the answers with the old processor's state;
 * - `contracts/` tests run them in process over a SQLite store.
 *
 * The questions:
 *
 *   Q1 every cell, with its nine fields                  `cell`
 *   Q2 the owner of every cell                           `cellOwner`
 *   Q3 the commitment of the connected account           `commitment(where: {account: {eq}})`
 *   Q4 the placements of the last 7 revealed epochs      `placement` + nested `players`
 *   Q5 the reward state of every account, and the global `sharedRate`, `globalRate`
 *   Q6 the points the game logic accumulated per owner   `computedPoints`
 *   (Q7 `fixedRate`: nothing in `web/` reads it; kept so the answer is the whole state)
 *
 * No `orderBy` over a `u256` (the browser does not yet sort one numerically), and
 * none of these needs one: the leaderboard sorts its rows itself.
 */
import {WINDOW, PLACEMENT_WINDOW, SINGLETON} from './entities.js';
import {emptyData, type Data} from './types.js';

/**
 * How many rows each list asks for. A list that comes back FULL is refused below
 * rather than taken as the whole set, because GraphQL's `first` cuts silently.
 * They sit under the browser's rows-examined bound (25,000 by default): a scan of
 * more rows than that is refused by the worker before this limit could matter.
 * alpha1 ends with 1,956 cells, 1,956 owners and 34 accounts.
 */
export const LIST_LIMIT = 20_000;
/** Players under one placement. The largest arrival on alpha1 has a handful. */
export const PLAYERS_LIMIT = 4_096;

const CELL_FIELDS =
	'position lastEpochUpdate epochWhenTokenIsAdded color life delta enemyMap distribution stake producingEpochs';

function stateDocument(commitments: 'one' | 'all'): string {
	const commitment =
		commitments === 'one'
			? `commitment(where: {account: {eq: $account}}, first: 1) { account epoch hash }`
			: `commitment(first: ${LIST_LIMIT}) { account epoch hash }`;
	return `query StratagemsState${commitments === 'one' ? '($account: String!)' : ''} {
	cell(first: ${LIST_LIMIT}) { ${CELL_FIELDS} }
	cellOwner(first: ${LIST_LIMIT}) { position owner }
	${commitment}
	placement(where: {window: {eq: "${WINDOW}"}}, orderBy: {field: ordinal, direction: desc}, first: ${PLACEMENT_WINDOW}) {
		ordinal
		epoch
		players(orderBy: {field: moveOrdinal, direction: asc}, first: ${PLAYERS_LIMIT}) { position moveOrdinal color address }
	}
	sharedRate(first: ${LIST_LIMIT}) { account points totalRewardPerPointAccounted rewardsToWithdraw }
	fixedRate(first: ${LIST_LIMIT}) { account toWithdraw lastTime }
	globalRate(where: {id: {eq: "${SINGLETON.id}"}}, first: 1) { lastUpdateTime totalRewardPerPointAtLastUpdate totalPoints }
	computedPoints(first: ${LIST_LIMIT}) { owner points }
}`;
}

/** The web app's document: the whole game state, and the commitment of ONE account. */
export const STATE_QUERY = stateDocument('one');
/** The same, with every account's commitment: what the oracle comparison asks. */
export const FULL_STATE_QUERY = stateDocument('all');

/** What a GraphQL executor answers (`QueryResult` in `@etherfold/graphql`), as far as this module reads it. */
export type QueryAnswer = {
	readonly data?: unknown;
	readonly errors?: readonly {readonly message: string; readonly extensions?: {readonly code?: unknown}}[];
	readonly extensions?: {readonly block?: number | null; readonly generation?: string};
};

/** Any executor: `workerExecutor(port)`, `httpExecutor(url)`, `localExecutor(schema, context)`. */
export type Execute = (request: {
	readonly query: string;
	readonly variables?: Readonly<Record<string, unknown>>;
}) => Promise<QueryAnswer>;

/** A refused or failed query, carrying the code the executor gave (`rows-examined-bound`, `transport-failure`, ...). */
export class StateQueryError extends Error {
	constructor(
		message: string,
		readonly code: string | undefined,
	) {
		super(message);
		this.name = 'StateQueryError';
	}
}

export type StateRead = {
	readonly data: Data;
	/** The one block every field was read as of (undefined before the first block). */
	readonly block?: number;
	/** The generation that answered. */
	readonly generation?: string;
};

type Row = Record<string, unknown>;

type Answer = {
	cell: Row[];
	cellOwner: Row[];
	commitment: Row[];
	placement: (Row & {players: Row[]})[];
	sharedRate: Row[];
	fixedRate: Row[];
	globalRate: Row[];
	computedPoints: Row[];
};

function full(list: readonly unknown[], limit: number, what: string): void {
	if (list.length >= limit) {
		throw new StateQueryError(
			`${what} answered ${list.length} rows, the limit it asked for: the state may hold more, and a cut list is ` +
				`not the whole set. Raise the limit in stratagems-indexer's queries.ts.`,
			'list-limit-reached',
		);
	}
}

/**
 * Ask the whole game state, and answer it in the shape the app computes with.
 *
 * `account` given: that account's commitment only (the web app's question). Left
 * out: every commitment (the comparison's).
 */
export async function readState(execute: Execute, options: {account?: string} = {}): Promise<StateRead> {
	const request =
		options.account !== undefined
			? {query: STATE_QUERY, variables: {account: options.account.toLowerCase()}}
			: {query: FULL_STATE_QUERY};
	const result = await execute(request);
	if (result.errors && result.errors.length > 0) {
		const first = result.errors[0];
		const code = typeof first.extensions?.code === 'string' ? first.extensions.code : undefined;
		throw new StateQueryError(`${code ? `${code}: ` : ''}${first.message}`, code);
	}
	const answer = result.data as Answer;
	for (const name of ['cell', 'cellOwner', 'commitment', 'sharedRate', 'fixedRate', 'computedPoints'] as const) {
		full(answer[name], LIST_LIMIT, name);
	}

	const data = emptyData();
	for (const row of answer.cell) {
		data.cells[String(row.position)] = {
			lastEpochUpdate: Number(row.lastEpochUpdate),
			epochWhenTokenIsAdded: Number(row.epochWhenTokenIsAdded),
			color: Number(row.color),
			life: Number(row.life),
			delta: Number(row.delta),
			enemyMap: Number(row.enemyMap),
			distribution: Number(row.distribution),
			stake: Number(row.stake),
			producingEpochs: Number(row.producingEpochs),
		};
	}
	for (const row of answer.cellOwner) {
		data.owners[String(row.position)] = row.owner as `0x${string}`;
	}
	for (const row of answer.commitment) {
		data.commitments[String(row.account)] = {epoch: Number(row.epoch), hash: row.hash as `0x${string}`};
	}
	// newest arrival first, as the old processor unshifted; players in arrival order
	for (const placement of answer.placement) {
		full(placement.players, PLAYERS_LIMIT, `the players of placement ${placement.ordinal}`);
		const cells: Data['placements'][number]['cells'] = {};
		for (const player of placement.players) {
			const cell = (cells[String(player.position)] ??= {players: []});
			cell.players.push({color: Number(player.color), address: String(player.address)});
		}
		data.placements.push({epoch: Number(placement.epoch), cells});
	}
	// a `u256` crosses as a decimal string (JSON has no bigint)
	for (const row of answer.sharedRate) {
		data.points.shared[String(row.account)] = {
			points: BigInt(row.points as string),
			totalRewardPerPointAccounted: BigInt(row.totalRewardPerPointAccounted as string),
			rewardsToWithdraw: BigInt(row.rewardsToWithdraw as string),
		};
	}
	for (const row of answer.fixedRate) {
		data.points.fixed[String(row.account)] = {
			toWithdraw: BigInt(row.toWithdraw as string),
			lastTime: Number(row.lastTime),
		};
	}
	const global = answer.globalRate[0];
	if (global) {
		data.points.global = {
			lastUpdateTime: Number(global.lastUpdateTime),
			totalRewardPerPointAtLastUpdate: BigInt(global.totalRewardPerPointAtLastUpdate as string),
			totalPoints: BigInt(global.totalPoints as string),
		};
	}
	for (const row of answer.computedPoints) {
		data.computedPoints[String(row.owner)] = Number(row.points);
	}

	return {data, block: result.extensions?.block ?? undefined, generation: result.extensions?.generation};
}

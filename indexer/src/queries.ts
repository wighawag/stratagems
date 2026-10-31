/**
 * THE QUESTIONS THE WEB APP ASKS, as GraphQL documents over the schema etherfold
 * builds from `./entities.ts` (etherfold ADR-0098, ADR-0099), and the code that
 * turns their answers into the shape the app computes with (`Data`).
 *
 * One module for every reader, so what is checked is what runs:
 *
 * - `web/` follows the state with the framework's follower (`$lib/indexer`'s
 *   `createStateFollower`, handed `PARTS`, `PART_OF_ENTITY` and `readParts`): one
 *   full read, then, each time the worker says the state moved, a read of only the
 *   PARTS whose entities moved, pinned to the HASH of the block the signal names;
 * - alpha1's oracle (`oracle/2026-09-29-alpha1/compare.ts`, at the tag
 *   `alpha1-final`: it left with alpha1's support in step 10b) ran the same
 *   documents against the database `etherfold build` folded and against the
 *   publication, and compared the answers with the old processor's state; and
 *   `web/verify/alpha1.spec.ts` (same tag) checked, in a real browser, that the
 *   parts a tab re-read signal by signal while indexing alpha1 compose into the
 *   oracle's state;
 * - `contracts/` tests run them in process over a SQLite store.
 *
 * The questions, one PART each:
 *
 *   Q1 every cell, with its nine fields                  `cells`          (`cell`)
 *   Q2 the owner of every cell                           `owners`         (`cellOwner`)
 *   Q3 the commitment of the connected account           `commitments`    (`commitment`, `where: {account: {eq}}`)
 *   Q4 the placements of the last 7 revealed cycles      `placements`     (`placement` + nested `players`)
 *   Q5 the reward state of every account, and the global `shared`, `global` (`sharedRate`, `globalRate`)
 *   (Q6, the points the processor's copy of the rules tallied, left with that copy in step X2)
 *   (Q7 `fixed`, `fixedRate`: nothing in `web/` reads it; kept so the answer is the whole state)
 *   Q8 the cycle the last push left, if any              `advancedCycle`  (`advancedCycle`, the board's stamp under Manual)
 *
 * No `orderBy` over a `u256` (the browser does not yet sort one numerically), and
 * none of these needs one: the leaderboard sorts its rows itself.
 */
import {WINDOW, PLACEMENT_WINDOW, SINGLETON} from './entities.js';
import {emptyData, type Data} from './types.js';

/**
 * How many rows each list asks for. It is a CAP, not a cost: the browser's scan
 * walks every live row of the entity whatever `first` says. A list that comes back
 * FULL is refused below rather than taken as the whole set, because GraphQL's
 * `first` cuts silently. alpha1 ends with 1,956 cells, 1,956 owners, 34 accounts.
 */
export const LIST_LIMIT = 20_000;
/** Players under one placement. The largest arrival on alpha1 has a handful. */
export const PLAYERS_LIMIT = 4_096;

const CELL_FIELDS =
	'position lastCycleUpdate cycleWhenTokenIsAdded color life delta enemyMap distribution stake producingCycles';

/** A part of the state: one question, its root fields, and the entities whose moves invalidate it. */
export type Part =
	| 'cells'
	| 'owners'
	| 'commitments'
	| 'placements'
	| 'shared'
	| 'fixed'
	| 'global'
	| 'advancedCycle';

export const PARTS: readonly Part[] = [
	'cells',
	'owners',
	'commitments',
	'placements',
	'shared',
	'fixed',
	'global',
	'advancedCycle',
];

/** Which part an entity's move invalidates (the state-moved signal names entities); an entity left out invalidates every part. */
export const PART_OF_ENTITY: Record<string, Part> = {
	cell: 'cells',
	cellOwner: 'owners',
	commitment: 'commitments',
	placement: 'placements',
	placementPlayer: 'placements',
	sharedRate: 'shared',
	fixedRate: 'fixed',
	globalRate: 'global',
	advancedCycle: 'advancedCycle',
};

type Commitments = 'one' | 'all';

/** The root field(s) of one part, as of `$block` (a `BlockAddress`: `{number}` or `{hash}`) when `pinned`. */
function rootFields(part: Part, commitments: Commitments, pinned: boolean): string {
	const at = pinned ? ', block: $block' : '';
	switch (part) {
		case 'cells':
			return `cell(first: ${LIST_LIMIT}${at}) { ${CELL_FIELDS} }`;
		case 'owners':
			return `cellOwner(first: ${LIST_LIMIT}${at}) { position owner }`;
		case 'commitments':
			return commitments === 'one'
				? `commitment(where: {account: {eq: $account}}, first: 1${at}) { account cycle hash bond }`
				: `commitment(first: ${LIST_LIMIT}${at}) { account cycle hash bond }`;
		case 'placements':
			return `placement(where: {window: {eq: "${WINDOW}"}}, orderBy: {field: ordinal, direction: desc}, first: ${PLACEMENT_WINDOW}${at}) {
		ordinal
		cycle
		players(orderBy: {field: moveOrdinal, direction: asc}, first: ${PLAYERS_LIMIT}) { position moveOrdinal color address }
	}`;
		case 'shared':
			return `sharedRate(first: ${LIST_LIMIT}${at}) { account points totalRewardPerPointAccounted rewardsToWithdraw }`;
		case 'fixed':
			return `fixedRate(first: ${LIST_LIMIT}${at}) { account toWithdraw lastTime }`;
		case 'global':
			return `globalRate(where: {id: {eq: "${SINGLETON.id}"}}, first: 1${at}) { lastUpdateTime totalRewardPerPointAtLastUpdate totalPoints }`;
		case 'advancedCycle':
			return `advancedCycle(where: {id: {eq: "${SINGLETON.id}"}}, first: 1${at}) { cycleNumber commiting }`;
	}
}

/**
 * One document asking the given parts, every root field as of the same block:
 * the tip when `pinned` is false (the operation pins one block itself), or
 * `$block`, a `BlockAddress` (`{number}` or `{hash}`, etherfold ADR-0099).
 */
export function stateDocument(parts: Iterable<Part>, options: {commitments: Commitments; pinned: boolean}): string {
	const wanted = new Set(parts);
	const variables: string[] = [];
	if (options.commitments === 'one' && wanted.has('commitments')) variables.push('$account: String!');
	if (options.pinned) variables.push('$block: BlockAddress!');
	const fields = PARTS.filter((part) => wanted.has(part)).map((part) =>
		rootFields(part, options.commitments, options.pinned),
	);
	return `query StratagemsState${variables.length ? `(${variables.join(', ')})` : ''} {\n\t${fields.join('\n\t')}\n}`;
}

/** The web app's whole-state document: every part, and the commitment of ONE account. */
export const STATE_QUERY = stateDocument(PARTS, {commitments: 'one', pinned: false});
/** The same, with every account's commitment: what the oracle comparison asks. */
export const FULL_STATE_QUERY = stateDocument(PARTS, {commitments: 'all', pinned: false});

/** What a GraphQL executor answers (`QueryResult` in `@etherfold/graphql`), as far as this module reads it. */
export type QueryAnswer = {
	readonly data?: unknown;
	readonly errors?: readonly {readonly message: string; readonly extensions?: {readonly code?: unknown}}[];
	readonly extensions?: {
		readonly block?: number | null;
		readonly blockHash?: string | null;
		readonly generation?: string;
	};
};

/** A recorded block: its number, and the hash that names it on ONE chain. */
export type BlockRef = {readonly number: number; readonly hash: string};

/**
 * The code a read pinned to a hash is refused with when the store has no record of
 * that hash: here, the block was replaced by a reorg (etherfold ADR-0015, ADR-0099).
 */
export const BLOCK_NOT_RECORDED = 'block-not-recorded';

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
	/** That block's hash (`extensions.blockHash`, or the hash the read was pinned to). */
	readonly blockHash?: string;
	/** The generation that answered. */
	readonly generation?: string;
};

type Row = Record<string, unknown>;

function full(list: readonly unknown[], limit: number, what: string): void {
	if (list.length >= limit) {
		throw new StateQueryError(
			`${what} answered ${list.length} rows, the limit it asked for: the state may hold more, and a cut list is ` +
				`not the whole set. Raise the limit in stratagems-indexer's queries.ts.`,
			'list-limit-reached',
		);
	}
}

/** Write the answer of each asked part into `data`, replacing what that part held. */
function writeParts(data: Data, parts: ReadonlySet<Part>, answer: Record<string, Row[]>): void {
	const list = (name: string) => {
		const rows = answer[name];
		full(rows, LIST_LIMIT, name);
		return rows;
	};
	if (parts.has('cells')) {
		data.cells = {};
		for (const row of list('cell')) {
			data.cells[String(row.position)] = {
				lastCycleUpdate: Number(row.lastCycleUpdate),
				cycleWhenTokenIsAdded: Number(row.cycleWhenTokenIsAdded),
				color: Number(row.color),
				life: Number(row.life),
				delta: Number(row.delta),
				enemyMap: Number(row.enemyMap),
				distribution: Number(row.distribution),
				stake: Number(row.stake),
				producingCycles: Number(row.producingCycles),
			};
		}
	}
	if (parts.has('owners')) {
		data.owners = {};
		for (const row of list('cellOwner')) data.owners[String(row.position)] = row.owner as `0x${string}`;
	}
	if (parts.has('commitments')) {
		data.commitments = {};
		for (const row of list('commitment')) {
			data.commitments[String(row.account)] = {
				cycle: Number(row.cycle),
				hash: row.hash as `0x${string}`,
				bond: BigInt(row.bond as string),
			};
		}
	}
	if (parts.has('placements')) {
		// newest arrival first, as the old processor unshifted; players in arrival order
		data.placements = [];
		for (const placement of answer.placement as (Row & {players: Row[]})[]) {
			full(placement.players, PLAYERS_LIMIT, `the players of placement ${placement.ordinal}`);
			const cells: Data['placements'][number]['cells'] = {};
			for (const player of placement.players) {
				const cell = (cells[String(player.position)] ??= {players: []});
				cell.players.push({color: Number(player.color), address: String(player.address)});
			}
			data.placements.push({cycle: Number(placement.cycle), cells});
		}
	}
	// a `u256` crosses as a decimal string (JSON has no bigint)
	if (parts.has('shared')) {
		data.points = {...data.points, shared: {}};
		for (const row of list('sharedRate')) {
			data.points.shared[String(row.account)] = {
				points: BigInt(row.points as string),
				totalRewardPerPointAccounted: BigInt(row.totalRewardPerPointAccounted as string),
				rewardsToWithdraw: BigInt(row.rewardsToWithdraw as string),
			};
		}
	}
	if (parts.has('fixed')) {
		data.points = {...data.points, fixed: {}};
		for (const row of list('fixedRate')) {
			data.points.fixed[String(row.account)] = {
				toWithdraw: BigInt(row.toWithdraw as string),
				lastTime: Number(row.lastTime),
			};
		}
	}
	if (parts.has('global')) {
		const global = answer.globalRate[0];
		data.points = {
			...data.points,
			global: global
				? {
						lastUpdateTime: Number(global.lastUpdateTime),
						totalRewardPerPointAtLastUpdate: BigInt(global.totalRewardPerPointAtLastUpdate as string),
						totalPoints: BigInt(global.totalPoints as string),
					}
				: emptyData().points.global,
		};
	}
	if (parts.has('advancedCycle')) {
		const row = answer.advancedCycle[0];
		data.advancedCycle = row
			? {cycleNumber: Number(row.cycleNumber), commiting: Number(row.commiting) === 1}
			: undefined;
	}
}

/**
 * Ask some parts of the state, all as of one block, and write them into a copy of
 * `into` (a fresh state when left out). The block is `at`: a number (`block:
 * {number}`), a `BlockRef` (`block: {hash}`: that block on ONE chain, refused as
 * `block-not-recorded` once a reorg replaced it), or, left out, the tip.
 *
 * `account` given: that account's commitment only (the web app's question). Left
 * out: every commitment (the comparison's).
 */
export async function readParts(
	execute: Execute,
	parts: Iterable<Part>,
	options: {account?: string; at?: number | BlockRef; into?: Data} = {},
): Promise<StateRead> {
	const wanted = new Set(parts);
	const commitments: Commitments = options.account !== undefined ? 'one' : 'all';
	const variables: Record<string, unknown> = {};
	if (commitments === 'one' && wanted.has('commitments')) variables.account = options.account!.toLowerCase();
	const at = options.at;
	if (at !== undefined) variables.block = typeof at === 'number' ? {number: at} : {hash: at.hash};
	const result = await execute({
		query: stateDocument(wanted, {commitments, pinned: at !== undefined}),
		variables,
	});
	if (result.errors && result.errors.length > 0) {
		const first = result.errors[0];
		const code = typeof first.extensions?.code === 'string' ? first.extensions.code : undefined;
		throw new StateQueryError(`${code ? `${code}: ` : ''}${first.message}`, code);
	}
	const data: Data = options.into ? {...options.into} : emptyData();
	writeParts(data, wanted, result.data as Record<string, Row[]>);
	// Pinned, the fields are as of `at`; `extensions` names the OPERATION's pin (the
	// tip), which may be later. Unpinned, the fields are as of that pin.
	if (at !== undefined && typeof at !== 'number') {
		return {data, block: at.number, blockHash: at.hash, generation: result.extensions?.generation};
	}
	return {
		data,
		block: at ?? result.extensions?.block ?? undefined,
		blockHash: at === undefined ? result.extensions?.blockHash ?? undefined : undefined,
		generation: result.extensions?.generation,
	};
}

/** Ask the whole game state, as of the tip. */
export function readState(execute: Execute, options: {account?: string} = {}): Promise<StateRead> {
	return readParts(execute, PARTS, options);
}

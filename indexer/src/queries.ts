/**
 * THE QUESTIONS THE WEB APP ASKS, as GraphQL documents over the schema etherfold
 * builds from `./entities.ts` (etherfold ADR-0098, ADR-0099), and the code that
 * turns their answers into the shape the app computes with (`Data`).
 *
 * One module for every reader, so what is checked is what runs:
 *
 * - `web/` follows the state with a `StateFollower`: one full read, then, each time
 *   the worker says the state moved, a read of only the PARTS whose entities moved,
 *   pinned to the block the signal names;
 * - `oracle/2026-09-29-alpha1/compare.ts` runs the same documents against the
 *   database `etherfold build` folded and against the publication, and compares the
 *   answers with the old processor's state; `web/verify/alpha1.spec.ts` checks, in a
 *   real browser, that the parts a tab re-read signal by signal while indexing
 *   alpha1 compose into the oracle's state;
 * - `contracts/` tests run them in process over a SQLite store.
 *
 * The questions, one PART each:
 *
 *   Q1 every cell, with its nine fields                  `cells`          (`cell`)
 *   Q2 the owner of every cell                           `owners`         (`cellOwner`)
 *   Q3 the commitment of the connected account           `commitments`    (`commitment`, `where: {account: {eq}}`)
 *   Q4 the placements of the last 7 revealed epochs      `placements`     (`placement` + nested `players`)
 *   Q5 the reward state of every account, and the global `shared`, `global` (`sharedRate`, `globalRate`)
 *   Q6 the points the game logic accumulated per owner   `computedPoints` (`computedPoints`)
 *   (Q7 `fixed`, `fixedRate`: nothing in `web/` reads it; kept so the answer is the whole state)
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
	'position lastEpochUpdate epochWhenTokenIsAdded color life delta enemyMap distribution stake producingEpochs';

/** A part of the state: one question, its root fields, and the entities whose moves invalidate it. */
export type Part = 'cells' | 'owners' | 'commitments' | 'placements' | 'shared' | 'fixed' | 'global' | 'computedPoints';

export const PARTS: readonly Part[] = [
	'cells',
	'owners',
	'commitments',
	'placements',
	'shared',
	'fixed',
	'global',
	'computedPoints',
];

/** Which part an entity's move invalidates (the state-moved signal names entities). */
const PART_OF_ENTITY: Record<string, Part> = {
	cell: 'cells',
	cellOwner: 'owners',
	commitment: 'commitments',
	placement: 'placements',
	placementPlayer: 'placements',
	sharedRate: 'shared',
	fixedRate: 'fixed',
	globalRate: 'global',
	computedPoints: 'computedPoints',
};

/** The parts the given entities' moves invalidate; an entity this module does not know invalidates everything. */
export function partsMovedBy(entities: readonly string[]): Set<Part> {
	const parts = new Set<Part>();
	for (const entity of entities) {
		const part = PART_OF_ENTITY[entity];
		if (!part) return new Set(PARTS);
		parts.add(part);
	}
	return parts;
}

type Commitments = 'one' | 'all';

/** The root field(s) of one part, as of `$block` when `pinned`. */
function rootFields(part: Part, commitments: Commitments, pinned: boolean): string {
	const at = pinned ? ', block: $block' : '';
	switch (part) {
		case 'cells':
			return `cell(first: ${LIST_LIMIT}${at}) { ${CELL_FIELDS} }`;
		case 'owners':
			return `cellOwner(first: ${LIST_LIMIT}${at}) { position owner }`;
		case 'commitments':
			return commitments === 'one'
				? `commitment(where: {account: {eq: $account}}, first: 1${at}) { account epoch hash }`
				: `commitment(first: ${LIST_LIMIT}${at}) { account epoch hash }`;
		case 'placements':
			return `placement(where: {window: {eq: "${WINDOW}"}}, orderBy: {field: ordinal, direction: desc}, first: ${PLACEMENT_WINDOW}${at}) {
		ordinal
		epoch
		players(orderBy: {field: moveOrdinal, direction: asc}, first: ${PLAYERS_LIMIT}) { position moveOrdinal color address }
	}`;
		case 'shared':
			return `sharedRate(first: ${LIST_LIMIT}${at}) { account points totalRewardPerPointAccounted rewardsToWithdraw }`;
		case 'fixed':
			return `fixedRate(first: ${LIST_LIMIT}${at}) { account toWithdraw lastTime }`;
		case 'global':
			return `globalRate(where: {id: {eq: "${SINGLETON.id}"}}, first: 1${at}) { lastUpdateTime totalRewardPerPointAtLastUpdate totalPoints }`;
		case 'computedPoints':
			return `computedPoints(first: ${LIST_LIMIT}${at}) { owner points }`;
	}
}

/**
 * One document asking the given parts, every root field as of the same block:
 * the tip when `pinned` is false (the operation pins one block itself), or `$block`.
 */
export function stateDocument(parts: Iterable<Part>, options: {commitments: Commitments; pinned: boolean}): string {
	const wanted = new Set(parts);
	const variables: string[] = [];
	if (options.commitments === 'one' && wanted.has('commitments')) variables.push('$account: String!');
	if (options.pinned) variables.push('$block: SafeInt!');
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
	}
	if (parts.has('owners')) {
		data.owners = {};
		for (const row of list('cellOwner')) data.owners[String(row.position)] = row.owner as `0x${string}`;
	}
	if (parts.has('commitments')) {
		data.commitments = {};
		for (const row of list('commitment')) {
			data.commitments[String(row.account)] = {epoch: Number(row.epoch), hash: row.hash as `0x${string}`};
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
			data.placements.push({epoch: Number(placement.epoch), cells});
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
	if (parts.has('computedPoints')) {
		data.computedPoints = {};
		for (const row of list('computedPoints')) data.computedPoints[String(row.owner)] = Number(row.points);
	}
}

/**
 * Ask some parts of the state, all as of one block (`block`, or the tip), and write
 * them into a copy of `into` (a fresh state when left out).
 *
 * `account` given: that account's commitment only (the web app's question). Left
 * out: every commitment (the comparison's).
 */
export async function readParts(
	execute: Execute,
	parts: Iterable<Part>,
	options: {account?: string; block?: number; into?: Data} = {},
): Promise<StateRead> {
	const wanted = new Set(parts);
	const commitments: Commitments = options.account !== undefined ? 'one' : 'all';
	const variables: Record<string, unknown> = {};
	if (commitments === 'one' && wanted.has('commitments')) variables.account = options.account!.toLowerCase();
	if (options.block !== undefined) variables.block = options.block;
	const result = await execute({
		query: stateDocument(wanted, {commitments, pinned: options.block !== undefined}),
		variables,
	});
	if (result.errors && result.errors.length > 0) {
		const first = result.errors[0];
		const code = typeof first.extensions?.code === 'string' ? first.extensions.code : undefined;
		throw new StateQueryError(`${code ? `${code}: ` : ''}${first.message}`, code);
	}
	const data: Data = options.into ? {...options.into} : emptyData();
	writeParts(data, wanted, result.data as Record<string, Row[]>);
	return {
		data,
		block: options.block ?? result.extensions?.block ?? undefined,
		generation: result.extensions?.generation,
	};
}

/** Ask the whole game state, as of the tip. */
export function readState(execute: Execute, options: {account?: string} = {}): Promise<StateRead> {
	return readParts(execute, PARTS, options);
}

/** What the state-moved signal says (etherfold's `StateMoved`), as far as the follower reads it. */
export type Moved =
	| {readonly kind: 'applied'; readonly block: number; readonly coherence: string; readonly entities: readonly string[]}
	| {readonly kind: 'retracted' | 'repointed'; readonly coherence: string};

/**
 * FOLLOW THE STATE, re-reading only what moved (etherfold ADR-0083).
 *
 * One full read, then per state-moved signal:
 *
 * - a coherence token it does not hold (a reorg, a promotion, the first signal):
 *   read everything again;
 * - an `applied` block: read only the parts whose entities the signal names, AS OF
 *   the signal's block (or the block this state is at, when that is later).
 *
 * Why that composes into the state of ONE block: a part the signals did not name
 * since it was read did not change since, so it is still right as of the newer
 * block; and every part that did is read as of that block. Pinning to a block the
 * fold has just applied is also what keeps the read cheap on IndexedDB, whose
 * as-of read costs the versions closed ABOVE that block (none, or a few).
 *
 * Work is serialised: one read at a time, the moves that arrive meanwhile merged
 * into the next one, so an older answer can never land after a newer one.
 */
export class StateFollower {
	private current: StateRead | undefined;
	private coherence: string | undefined;
	private everything = true;
	private dirty = new Set<Part>();
	private dirtyAt: number | undefined;
	private running: Promise<void> | undefined;
	private readonly listeners = new Set<(read: StateRead) => void>();

	constructor(
		private readonly execute: Execute,
		private account: string,
		private readonly onError: (error: StateQueryError) => void = () => {},
	) {}

	/** The last state read, with the block it is as of. */
	get state(): StateRead | undefined {
		return this.current;
	}

	onUpdate(listener: (read: StateRead) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Read everything again (the first read, or a reset). */
	refreshAll(): Promise<void> {
		this.everything = true;
		return this.schedule();
	}

	/** Feed it every state-moved signal, in order. */
	moved(moved: Moved): Promise<void> {
		if (moved.coherence !== this.coherence) {
			this.coherence = moved.coherence;
			this.everything = true;
		} else if (moved.kind === 'applied') {
			for (const part of partsMovedBy(moved.entities)) this.dirty.add(part);
			this.dirtyAt = Math.max(this.dirtyAt ?? moved.block, moved.block);
		} else {
			this.everything = true;
		}
		return this.schedule();
	}

	/** The connected account changed: its commitment is the one part that depends on it. */
	setAccount(account: string): Promise<void> {
		if (account.toLowerCase() === this.account.toLowerCase()) return Promise.resolve();
		this.account = account;
		this.dirty.add('commitments');
		return this.schedule();
	}

	private schedule(): Promise<void> {
		if (!this.running) {
			this.running = this.drain().finally(() => (this.running = undefined));
		}
		return this.running;
	}

	private async drain(): Promise<void> {
		while (this.everything || this.dirty.size > 0) {
			const everything = this.everything || !this.current;
			const parts = everything ? new Set(PARTS) : this.dirty;
			const block = everything ? undefined : Math.max(this.dirtyAt ?? 0, this.current!.block ?? 0) || undefined;
			this.everything = false;
			this.dirty = new Set();
			this.dirtyAt = undefined;
			try {
				this.current = await readParts(this.execute, parts, {
					account: this.account,
					block,
					into: everything ? undefined : this.current!.data,
				});
			} catch (error) {
				// read it all again next time: a part that failed is not known to be right
				this.everything = true;
				this.onError(error instanceof StateQueryError ? error : new StateQueryError(String(error), undefined));
				return;
			}
			for (const listener of this.listeners) listener(this.current);
		}
	}
}

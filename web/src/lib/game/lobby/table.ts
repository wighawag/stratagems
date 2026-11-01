/**
 * TABLES: games for a fixed set of players, created by anyone, each at an
 * address of its own (the commit-reveal base's `CommitRevealGameFactory`
 * clones a game's lobby implementation per table).
 *
 * A TABLE IS AN ADDRESS, AND THAT IS ALL THE CLIENT NEEDS TO KNOW. Everything
 * it keys by is the game contract's address already (the stored submission,
 * the delegation, the reveal service's slot, an indexer), so a table is the
 * app composed with a deployment record whose game is at the table's address:
 * `?game=<address>` on any page, read once when the context is built
 * (`$lib/context/index.ts`). Which record that is, is the GAME's answer
 * ({@link TableLobby}, exported as `lobby` by its `$app-specific` module): the
 * names of its lobby implementation and its factory are its own.
 *
 * THE ROSTER'S RULES ARE THE CONTRACT'S (`UsingCommitReveal._openRoster`): a
 * seat is taken by staking while the table has not started and a seat is
 * free; the creator starts it once two are seated, and may forfeit a member
 * who has not committed in the current commit phase. This module reads the
 * roster and sends the creator's two transactions; it decides none of it.
 */
import {get, writable, type Readable} from 'svelte/store';
import {parseAbi, parseEventLogs, isAddress} from 'viem';
import type {CoreServices} from '$lib/context/core';
import type {TypedDeployments} from '$lib/deployments-store';
import {sendMove} from '$lib/game/core/commit-reveal/send';
import {tableAtRoster, type TableSeat} from './seats';

/** The lobby's routes, as `ICommitRevealLobby` declares them. */
export const LOBBY_ABI = parseAbi([
	'function getRoster() view returns ((address creator, uint8 seats, bool started) roster, uint256[] members)',
	'function start() returns (uint64 cycleNumber)',
	'function forfeitMember(uint256 player)',
]);

/** The factory, as `CommitRevealGameFactory` declares it. */
export const FACTORY_ABI = parseAbi([
	'function createGame(uint8 seats) returns (address game)',
	'function numGames() view returns (uint256)',
	'function getGames(uint256 start, uint256 limit) view returns (address[] games)',
	'event GameCreated(address indexed game, address indexed creator, uint8 seats)',
]);

/** The fewest and most seats a table offers; the contract refuses fewer than two. */
export const FEWEST_TABLE_SEATS = 2;
export const MOST_TABLE_SEATS = 8;

/**
 * A GAME'S TABLES: where its factory is, and the deployment record of one of
 * its tables. Exported as `lobby` by the game's `$app-specific` module; a game
 * with no tables exports nothing, and has none.
 */
export type TableLobby = {
	/** The factory every table of this game is created by. */
	factory(deployments: TypedDeployments): {address: `0x${string}`};
	/** The world's record, with the game at `table`: its lobby implementation's ABI and its factory's config. */
	deploymentsAt(
		deployments: TypedDeployments,
		table: `0x${string}`,
	): TypedDeployments;
};

/** The table a query parameter names, if it names one. */
export function tableFromParam(param: unknown): `0x${string}` | undefined {
	return typeof param === 'string' && isAddress(param) ? param : undefined;
}

/** A table's roster, as the contract holds it. */
export type Roster = {
	creator: `0x${string}`;
	seats: number;
	started: boolean;
	/** Who holds a seat, as the contract keys them. */
	members: readonly bigint[];
};

type Reader = Pick<CoreServices['publicClient'], 'readContract'>;

export async function readRoster(
	publicClient: Reader,
	table: `0x${string}`,
): Promise<Roster> {
	const [roster, members] = (await publicClient.readContract({
		address: table,
		abi: LOBBY_ABI,
		functionName: 'getRoster',
	})) as readonly [
		{creator: `0x${string}`; seats: number; started: boolean},
		readonly bigint[],
	];
	return {
		creator: roster.creator,
		seats: Number(roster.seats),
		started: roster.started,
		members,
	};
}

/** A table as the lobby lists it. */
export type TableSummary = Roster & {address: `0x${string}`};

/** The most recent tables a factory created, newest first. */
export async function readTables(
	publicClient: Reader,
	factory: `0x${string}`,
	options?: {limit?: number},
): Promise<TableSummary[]> {
	const limit = BigInt(options?.limit ?? 20);
	const total = (await publicClient.readContract({
		address: factory,
		abi: FACTORY_ABI,
		functionName: 'numGames',
	})) as bigint;
	const start = total > limit ? total - limit : 0n;
	const games = (await publicClient.readContract({
		address: factory,
		abi: FACTORY_ABI,
		functionName: 'getGames',
		args: [start, limit],
	})) as readonly `0x${string}`[];
	const tables = await Promise.all(
		games.map(async (address) => ({
			address,
			...(await readRoster(publicClient, address)),
		})),
	);
	return tables.reverse();
}

/** Whether `you` (an identity as the contract keys it) holds a seat. */
export function isMember(roster: Roster, you: bigint | undefined): boolean {
	return you !== undefined && roster.members.some((member) => member === you);
}

/**
 * How a member is named on screen: an identity that fits an address is shown
 * as one (shortened), anything bigger (a token) by its number.
 */
export function memberLabel(player: bigint): string {
	if (player < 1n << 160n) {
		const address = `0x${player.toString(16).padStart(40, '0')}`;
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}
	return `#${player}`;
}

// ---------------------------------------------------------------------------
// The lobby: the tables, and creating one
// ---------------------------------------------------------------------------

export type TablesState =
	| {step: 'Idle'}
	| {step: 'Loading'}
	| {step: 'Loaded'; tables: readonly TableSummary[]}
	| {step: 'Failed'; message: string};

export type CreateTableState =
	| {step: 'Idle'}
	| {step: 'Creating'; seats: number}
	| {step: 'Created'; table: `0x${string}`}
	| {step: 'Failed'; message: string};

export type TablesLobby = {
	tables: Readable<TablesState>;
	creating: Readable<CreateTableState>;
	refresh(): Promise<void>;
	/** Create a table of `seats`, the connected ACCOUNT its creator; resolves to its address. */
	create(seats: number): Promise<`0x${string}` | undefined>;
};

/**
 * The lobby's store. The table is created from the ACCOUNT (the wallet), not
 * the browser's key: its creator is whoever sends it, and the creator should
 * be who plays, not a key this browser could lose.
 */
export function createTablesLobby(params: {
	deps: Pick<
		CoreServices,
		'publicClient' | 'accountExecutor' | 'connection' | 'deployments'
	>;
	lobby: TableLobby;
}): TablesLobby {
	const {deps, lobby} = params;
	const tables = writable<TablesState>({step: 'Idle'});
	const creating = writable<CreateTableState>({step: 'Idle'});
	const factory = () => lobby.factory(deps.deployments.get()).address;

	async function refresh() {
		if (get(tables).step !== 'Loaded') tables.set({step: 'Loading'});
		try {
			tables.set({
				step: 'Loaded',
				tables: await readTables(deps.publicClient, factory()),
			});
		} catch (error) {
			tables.set({step: 'Failed', message: messageOf(error)});
		}
	}

	async function create(seats: number) {
		creating.set({step: 'Creating', seats});
		try {
			await deps.connection.ensureConnected();
			const executor = get(deps.accountExecutor);
			if (executor.status !== 'ready') {
				throw new Error('Connect a wallet to create a table.');
			}
			const hash = await executor.client.writeContract({
				address: factory(),
				abi: FACTORY_ABI,
				functionName: 'createGame',
				args: [seats],
				account: executor.account,
				chain: null,
			} as never);
			const receipt = await deps.publicClient.waitForTransactionReceipt({
				hash,
			});
			const [created] = parseEventLogs({
				abi: FACTORY_ABI,
				logs: receipt.logs,
				eventName: 'GameCreated',
			});
			if (!created) {
				throw new Error('The table was not created.');
			}
			creating.set({step: 'Created', table: created.args.game});
			void refresh();
			return created.args.game;
		} catch (error) {
			creating.set({step: 'Failed', message: messageOf(error)});
			return undefined;
		}
	}

	return {
		tables: {subscribe: tables.subscribe},
		creating: {subscribe: creating.subscribe},
		refresh,
		create,
	};
}

// ---------------------------------------------------------------------------
// At a table: its roster, and the creator's two powers
// ---------------------------------------------------------------------------

export type TableState =
	| {step: 'Loading'}
	| {
			step: 'Loaded';
			roster: Roster;
			/** The seats, laid out with their occupants. */
			table: readonly TableSeat[];
			/** Whether this account created the table, and so starts it. */
			isCreator: boolean;
			/** Whether this browser's identity holds a seat. */
			seated: boolean;
	  }
	| {step: 'Failed'; message: string};

export type TableAction =
	| {step: 'Idle'}
	| {step: 'Sending'; action: 'start' | 'forfeit'}
	| {step: 'Failed'; action: 'start' | 'forfeit'; message: string};

export type TableStore = Readable<TableState> & {
	address: `0x${string}`;
	action: Readable<TableAction>;
	update(): Promise<void>;
	/** The creator starts the table (sent by this browser's key, a delegate of theirs). */
	start(): Promise<void>;
	/** The creator forfeits a member who has not committed in this commit phase. */
	forfeit(member: bigint): Promise<void>;
	startPolling(): () => void;
};

export function createTableStore(params: {
	deps: Pick<
		CoreServices,
		| 'publicClient'
		| 'account'
		| 'connection'
		| 'signerExecutor'
		| 'deployments'
		| 'signerBalance'
	>;
	table: `0x${string}`;
	/**
	 * This browser's identity as the contract keys it, which is what a member
	 * is (`$lib/game/identity`'s `onchainIdentity` of the game's active
	 * identity). The creator is an ACCOUNT, compared with `deps.account`.
	 */
	you: Readable<bigint | undefined>;
	/** Called after the creator's transactions land, so the game re-reads its cycle. */
	onChanged?: () => void;
	pollInterval?: number;
}): TableStore {
	const {deps, table} = params;
	const state = writable<TableState>({step: 'Loading'});
	const action = writable<TableAction>({step: 'Idle'});
	let roster: Roster | undefined;

	function publish() {
		if (!roster) return;
		const account = get(deps.account);
		const you = get(params.you);
		state.set({
			step: 'Loaded',
			roster,
			table: tableAtRoster(roster.seats, roster.members, you),
			isCreator:
				account !== undefined &&
				account.toLowerCase() === roster.creator.toLowerCase(),
			seated: isMember(roster, you),
		});
	}

	async function update() {
		try {
			roster = await readRoster(deps.publicClient, table);
			publish();
		} catch (error) {
			if (!roster) state.set({step: 'Failed', message: messageOf(error)});
		}
	}

	async function send(
		kind: 'start' | 'forfeit',
		request:
			{functionName: 'start'} | {functionName: 'forfeitMember'; args: [bigint]},
	) {
		action.set({step: 'Sending', action: kind});
		try {
			await deps.connection.ensureConnected();
			const executor = get(deps.signerExecutor);
			if (executor.status !== 'ready') {
				throw new Error('No signing key yet: stake at this table first.');
			}
			await sendMove(
				deps,
				executor,
				{
					address: table,
					abi: LOBBY_ABI,
					...request,
					account: executor.account,
					chain: null,
				},
				kind === 'start' ? 'Starting the table' : 'The forfeit',
			);
			action.set({step: 'Idle'});
			await update();
			params.onChanged?.();
		} catch (error) {
			action.set({step: 'Failed', action: kind, message: messageOf(error)});
		}
	}

	return {
		subscribe: state.subscribe,
		address: table,
		action: {subscribe: action.subscribe},
		update,
		start: () => send('start', {functionName: 'start'}),
		forfeit: (member) =>
			send('forfeit', {functionName: 'forfeitMember', args: [member]}),
		startPolling() {
			void update();
			const timer = setInterval(
				() => void update(),
				params.pollInterval ?? 2000,
			);
			const stopAccount = deps.account.subscribe(() => publish());
			const stopYou = params.you.subscribe(() => publish());
			return () => {
				clearInterval(timer);
				stopAccount();
				stopYou();
			};
		},
	};
}

function messageOf(error: unknown): string {
	if (error && typeof error === 'object' && 'shortMessage' in error) {
		return String((error as {shortMessage: unknown}).shortMessage);
	}
	return error instanceof Error ? error.message : String(error);
}

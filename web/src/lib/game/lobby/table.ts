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
 *
 * A TABLE ENDS after the number of cycles its creator chose: after the last
 * one the contract refuses every commitment, advance and forfeit
 * (`CommitReveal.start` fixes the last cycle). And it carries the GAME'S own
 * options (`gameOptions`, a `bytes32` the base stores and never reads), which
 * only the game's module encodes and decodes; the reference game sends none.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import {parseAbi, parseEventLogs, isAddress} from 'viem';
import type {CoreServices} from '$lib/context/core';
import type {TypedDeployments} from '$lib/deployments-store';
import {sendMove} from '$lib/game/core/commit-reveal/send';
import {InsufficientFundsError} from '$lib/core/transaction';
import type {CycleConfig} from '$lib/game/core/cycle';
import {tableAtRoster, type TableSeat} from './seats';

/** The lobby's routes, as `ICommitRevealLobby` declares them. */
export const LOBBY_ABI = parseAbi([
	'function getRoster() view returns ((address creator, uint8 seats, bool started, uint16 cycles, uint8 startedWith) roster, uint256[] members)',
	'function getEnd() view returns (uint64 cycleNumber, uint64 lastCycleNumber, bool ended)',
	'function getGameOptions() view returns (bytes32)',
	'function start() returns (uint64 cycleNumber)',
	'function forfeitMember(uint256 player)',
]);

/** The factory, as `CommitRevealGameFactory` declares it. */
export const FACTORY_ABI = parseAbi([
	'function createGame(uint8 seats, uint16 cycles, bytes32 gameOptions) returns (address game)',
	'function numGames() view returns (uint256)',
	'function getGames(uint256 start, uint256 limit) view returns (address[] games)',
	'event GameCreated(address indexed game, address indexed creator, uint8 seats, uint16 cycles, bytes32 gameOptions)',
]);

/** The fewest and most seats a table offers; the contract refuses fewer than two. */
export const FEWEST_TABLE_SEATS = 2;
export const MOST_TABLE_SEATS = 8;

/**
 * How many cycles a table may be created to play. The contract refuses only
 * zero (every table ends); the bounds are the client's: at the slowest
 * durations a table is deployed with (180 + 60 s) the most is under seven
 * hours, the default (10) forty minutes, less with early advance.
 */
export const FEWEST_TABLE_CYCLES = 2;
export const MOST_TABLE_CYCLES = 100;
export const DEFAULT_TABLE_CYCLES = 10;

/** The options of a game that reads none: what the reference game sends. */
export const NO_GAME_OPTIONS =
	'0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/** A count of cycles the lobby offers, or the default for anything else. */
export function clampTableCycles(cycles: unknown): number {
	const n = typeof cycles === 'number' ? Math.floor(cycles) : NaN;
	if (!Number.isFinite(n)) return DEFAULT_TABLE_CYCLES;
	return Math.min(MOST_TABLE_CYCLES, Math.max(FEWEST_TABLE_CYCLES, n));
}

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
	/**
	 * What the creator chooses for the GAME at a table, if the game reads
	 * anything (its `gameOptions`): the lobby asks for each field and sends
	 * what `encode` makes of the answers. A game that reads none leaves it out,
	 * and its tables are created with {@link NO_GAME_OPTIONS}.
	 */
	options?: TableOptions;
};

/** One number the creator chooses for the game, as the lobby asks for it. */
export type TableOptionField = {
	id: string;
	label: string;
	min: number;
	max: number;
	default: number;
	/** Said after the number, e.g. `gems` or `%`. */
	unit?: string;
};

/** A game's options at a table: what to ask, how to send it, how to say it. */
export type TableOptions = {
	fields: readonly TableOptionField[];
	/** The `bytes32` the game's contract reads, from one value per field. */
	encode(values: Readonly<Record<string, number>>): `0x${string}`;
	/** What a table's options mean, as a person reads them; nothing when unreadable. */
	describe(
		gameOptions: `0x${string}`,
	): readonly {label: string; value: string}[];
};

/** Every field at its default. */
export function defaultOptionValues(
	options: TableOptions,
): Record<string, number> {
	return Object.fromEntries(options.fields.map((f) => [f.id, f.default]));
}

/** A value the field allows: a whole number inside its bounds, its default otherwise. */
export function clampOptionValue(
	field: TableOptionField,
	value: unknown,
): number {
	const n = typeof value === 'number' ? Math.floor(value) : NaN;
	if (!Number.isFinite(n)) return field.default;
	return Math.min(field.max, Math.max(field.min, n));
}

/** The options to send, every value clamped to its field. */
export function encodeTableOptions(
	options: TableOptions,
	values: Readonly<Record<string, unknown>>,
): `0x${string}` {
	return options.encode(
		Object.fromEntries(
			options.fields.map((f) => [f.id, clampOptionValue(f, values[f.id])]),
		),
	);
}

/** The table a query parameter names, if it names one. */
export function tableFromParam(param: unknown): `0x${string}` | undefined {
	return typeof param === 'string' && isAddress(param) ? param : undefined;
}

/** A table's roster, as the contract holds it, and where it is against its end. */
export type Roster = {
	creator: `0x${string}`;
	seats: number;
	started: boolean;
	/** How many cycles it plays from its start. */
	cycles: number;
	/** How many were seated when it started (zero before). */
	startedWith: number;
	/** Who holds a seat, as the contract keys them. */
	members: readonly bigint[];
	/** The cycle the chain is in, as of this read. */
	cycleNumber: bigint;
	/** The last cycle it plays; zero before the start. */
	lastCycleNumber: bigint;
	/** Whether it has played its last cycle. */
	ended: boolean;
	/** The game's own options, as created: see {@link NO_GAME_OPTIONS}. */
	gameOptions: `0x${string}`;
};

type Reader = Pick<CoreServices['publicClient'], 'readContract'>;

export async function readRoster(
	publicClient: Reader,
	table: `0x${string}`,
): Promise<Roster> {
	const [[roster, members], [cycleNumber, lastCycleNumber, ended], options] =
		(await Promise.all([
			publicClient.readContract({
				address: table,
				abi: LOBBY_ABI,
				functionName: 'getRoster',
			}),
			publicClient.readContract({
				address: table,
				abi: LOBBY_ABI,
				functionName: 'getEnd',
			}),
			publicClient.readContract({
				address: table,
				abi: LOBBY_ABI,
				functionName: 'getGameOptions',
			}),
		])) as [
			readonly [
				{
					creator: `0x${string}`;
					seats: number;
					started: boolean;
					cycles: number;
					startedWith: number;
				},
				readonly bigint[],
			],
			readonly [bigint, bigint, boolean],
			`0x${string}`,
		];
	return {
		creator: roster.creator,
		seats: Number(roster.seats),
		started: roster.started,
		cycles: Number(roster.cycles),
		startedWith: Number(roster.startedWith),
		members,
		cycleNumber,
		lastCycleNumber,
		ended,
		gameOptions: options,
	};
}

/**
 * HOW FAR A STARTED TABLE IS: the cycle it plays (counted from one) out of
 * how many, or that it has ended. Nothing before the start, when the first
 * cycle is not fixed yet.
 */
export type TableProgress =
	{step: 'playing'; cycle: number; of: number} | {step: 'ended'; of: number};

export function tableProgressOf(roster: Roster): TableProgress | undefined {
	if (!roster.started || roster.lastCycleNumber === 0n) return undefined;
	if (roster.ended) return {step: 'ended', of: roster.cycles};
	const first = roster.lastCycleNumber - BigInt(roster.cycles) + 1n;
	const cycle = Number(roster.cycleNumber - first) + 1;
	return {
		step: 'playing',
		cycle: Math.min(roster.cycles, Math.max(1, cycle)),
		of: roster.cycles,
	};
}

/** The progress as a person reads it, for a panel or a list. */
export function describeTableProgress(progress: TableProgress): string {
	return progress.step === 'ended'
		? `Ended after ${progress.of} cycles`
		: `Cycle ${progress.cycle} of ${progress.of}`;
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
	| {step: 'Creating'; seats: number; cycles: number}
	| {step: 'Created'; table: `0x${string}`}
	| {step: 'Failed'; message: string};

export type TablesLobby = {
	tables: Readable<TablesState>;
	creating: Readable<CreateTableState>;
	refresh(): Promise<void>;
	/**
	 * Create a table of `seats` playing `cycles` (the default when omitted),
	 * with the game's own options (none when omitted), the connected ACCOUNT
	 * its creator; resolves to its address.
	 */
	create(
		seats: number,
		options?: {cycles?: number; gameOptions?: `0x${string}`},
	): Promise<`0x${string}` | undefined>;
};

/**
 * The lobby's store. The table is created from the ACCOUNT (the wallet), not
 * the browser's key: its creator is whoever sends it, and the creator should
 * be who plays, not a key this browser could lose.
 */
export function createTablesLobby(params: {
	deps: Pick<
		CoreServices,
		| 'publicClient'
		| 'accountExecutor'
		| 'connection'
		| 'deployments'
		| 'balanceCheck'
		| 'accountBalance'
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

	async function create(
		seats: number,
		options?: {cycles?: number; gameOptions?: `0x${string}`},
	) {
		const cycles = clampTableCycles(options?.cycles ?? DEFAULT_TABLE_CYCLES);
		const gameOptions = options?.gameOptions ?? NO_GAME_OPTIONS;
		creating.set({step: 'Creating', seats, cycles});
		try {
			await deps.connection.ensureConnected();
			const executor = get(deps.accountExecutor);
			if (executor.status !== 'ready') {
				throw new Error('Connect a wallet to create a table.');
			}
			// THROUGH THE BALANCE CHECK, as every transaction the account pays for:
			// a creator with no ether is shown the insufficient-funds modal and its
			// remedy (the faucet, where there is one) rather than the node's raw
			// "exceeds the balance of the account". On a LAN box every newcomer
			// starts with nothing, and creating a table is the first thing a host
			// does (found by stratagems' LAN rehearsal, its plan's step L2).
			const request = await deps.balanceCheck.ensureCanAfford(
				{
					contract: {
						address: factory(),
						abi: FACTORY_ABI,
						functionName: 'createGame',
						args: [seats, cycles, gameOptions],
						account: executor.account,
					},
				},
				{balance: deps.accountBalance, sender: executor.address},
			);
			const hash = await executor.client.writeContract({
				...(request as object),
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
			// The modal has already said why and offered the remedy; the creator
			// chose to stop, which is not a failure to paint again.
			if (error instanceof InsufficientFundsError) {
				creating.set({step: 'Idle'});
				return undefined;
			}
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
	/** What the table's page shows: see {@link tableScreenOf}. */
	screen: Readable<TableScreen>;
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
		screen: derived(state, tableScreenOf),
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

// ---------------------------------------------------------------------------
// Before the start: the table's own lobby screen
// ---------------------------------------------------------------------------

/**
 * WHETHER THE BOARD TAKES A TURN AT THIS TABLE: only once it has started, only
 * from a member, and never once it has ended. Before the start the contract
 * refuses a commitment from anyone (nobody is waited for yet), after it from
 * anyone not seated, and after the last cycle from everyone, so a plan made
 * then could only revert. `undefined` is a game with no table.
 */
export function tableAllowsPlay(state: TableState | undefined): boolean {
	if (state === undefined) return true;
	return (
		state.step === 'Loaded' &&
		state.roster.started &&
		!state.roster.ended &&
		state.seated
	);
}

/** What every table of this game plays by: the lobby implementation's config. */
export type TableSettings = {
	commitPhaseDuration: number;
	revealPhaseDuration: number;
	/** Whether a phase closes as soon as every member has acted. */
	earlyAdvance: boolean;
};

export function tableSettingsOf(cycle: CycleConfig): TableSettings {
	return {
		commitPhaseDuration: cycle.commitPhaseDuration,
		revealPhaseDuration: cycle.revealPhaseDuration,
		earlyAdvance: cycle.policy === 'hybrid',
	};
}

/** A duration in seconds, as a person reads it. */
export function describeDuration(seconds: number): string {
	if (seconds < 120) return `${seconds} seconds`;
	if (seconds < 7200) return `${Math.round(seconds / 60)} minutes`;
	return `${Math.round(seconds / 3600)} hours`;
}

/**
 * WHAT THE TABLE'S PAGE SHOWS: its lobby until it has started, then the board
 * to its members, and a closed door to anyone else.
 */
export type TableScreen =
	| {screen: 'loading'}
	| {screen: 'failed'; message: string}
	| {
			screen: 'lobby';
			/** Whether this browser's identity holds a seat. */
			seated: boolean;
			isCreator: boolean;
			/** Whether the creator may start now (two or more seated). */
			canStart: boolean;
			/** Whether a seat is still free to take. */
			seatFree: boolean;
			taken: number;
			seats: number;
			/** One sentence: what this person is waiting for, or can do. */
			status: string;
	  }
	| {screen: 'playing'}
	| {screen: 'closed'; status: string};

export function tableScreenOf(state: TableState): TableScreen {
	if (state.step === 'Loading') return {screen: 'loading'};
	if (state.step === 'Failed') {
		return {screen: 'failed', message: state.message};
	}
	const {roster, seated, isCreator} = state;
	const taken = roster.members.length;
	if (roster.started) {
		// A member keeps the board after the end: the final board, and whatever
		// the game shows of it, are theirs to see.
		return seated
			? {screen: 'playing'}
			: {
					screen: 'closed',
					status: roster.ended
						? 'This game has ended, and you were not one of its players.'
						: 'This game has started, and you are not one of its players.',
				};
	}
	const seatFree = taken < roster.seats;
	const canStart = isCreator && taken >= 2;
	const count = `${taken} of ${roster.seats} seats taken`;
	let status: string;
	if (!seated && !seatFree) {
		status = `Every seat is taken (${count}).`;
	} else if (!seated) {
		status = isCreator
			? `Take a seat to play at your own table (${count}).`
			: `Take a seat to join (${count}). The game begins when its creator starts it.`;
	} else if (!isCreator) {
		status = `You are seated. Waiting for the creator to start the game (${count}).`;
	} else if (!canStart) {
		status = `Waiting for at least one more player to take a seat (${count}). Send them the invite link.`;
	} else if (seatFree) {
		status = `You can start now, or wait for more players (${count}).`;
	} else {
		status = `Every seat is taken (${count}). Start when you are ready.`;
	}
	return {
		screen: 'lobby',
		seated,
		isCreator,
		canStart,
		seatFree,
		taken,
		seats: roster.seats,
		status,
	};
}

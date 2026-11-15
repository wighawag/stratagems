/**
 * A TABLE IN AN OFFLINE WORLD: the half of setting one up that is the same in
 * every game (stratagems' plan, step OT1, OT1-3 to OT1-6).
 *
 * An offline world plays a table on its own chain: the world's deploy has the
 * game's factory, the tab creates ONE table from the first person's account
 * (who is therefore its creator, and starts it), seats every seat by staking
 * at it, and starts it once they are all seated, so the page opens on its first
 * cycle. How a seat is STAKED is the game's (`$lib/offline`'s
 * `startOfflineTable`, as its world's stake is), and so is everything about
 * the context; what is here is creating the table, finding it again, and
 * starting it, each guarded by what the chain holds so that a reload, or a boot
 * interrupted half way, repeats nothing.
 *
 * ONE TABLE PER WORLD (OT1-4): leaving the table is leaving the world, so a
 * world's chain holds at most the one table this browser created on it.
 *
 * THE TABLE'S ADDRESS IS A RECORD, written the moment `createGame` is mined
 * and before anything is staked, and checked against the chain on every boot
 * after (OT1-3): a record the chain does not hold (no such game in the
 * factory, not a table of this game, not created by this world's first
 * person) is refused as incoherent, and the world starts again under a new
 * chain id, as an incoherent restore does (`$lib/embedded`'s
 * `restoreIsCoherent`). A table mined while the tab closed, before its record
 * was written, is found in the factory and adopted, so it is not created twice.
 *
 * AND THE BOOT'S GAME-AGNOSTIC HALF (stratagems' plan, step OT3, OT3-2): who
 * creates the table (`offlineTableCreator`), the boot's three steps around the
 * game's own stake (`seatTheOfflineTable`), and how the table's panel names
 * its seats (`offlineSeatLabels`). Every game's `$lib/offline` held the same
 * copy of these until then; what stays the game's is how a seat is staked and
 * how an account's identity is spelled.
 */
import {createWalletClient, custom, isAddress, parseEventLogs} from 'viem';
import type {CoreServices} from '$lib/context/core';
import type {EmbeddedWallet} from '$lib/embedded/wallet';
import {humansAtThisDevice, seatsPlayedByTheWorld, type Table} from './seats';
import {
	FACTORY_ABI,
	LOBBY_ABI,
	readRoster,
	resolveTable,
	type ResolvedTable,
} from './table';

type Reader = Pick<
	CoreServices['publicClient'],
	'readContract' | 'getCode' | 'waitForTransactionReceipt'
>;

/**
 * WHO CREATES AND STARTS THE TABLE: the first person's account, sending
 * through the world's own wallet (in a test, a key). Its creator is whoever
 * sends `createGame`, and `start` is the creator's.
 */
export type OfflineTableCreator = {
	address: `0x${string}`;
	writeContract(request: {
		address: `0x${string}`;
		abi: typeof FACTORY_ABI | typeof LOBBY_ABI;
		functionName: string;
		args?: readonly unknown[];
	}): Promise<`0x${string}`>;
};

export type OfflineTableOpening =
	| {kind: 'table'; table: ResolvedTable; created: boolean}
	| {kind: 'incoherent'; reason: string};

/** Every table the factory created, oldest first. */
async function tablesOf(
	reader: Reader,
	factory: `0x${string}`,
): Promise<readonly `0x${string}`[]> {
	const total = (await reader.readContract({
		address: factory,
		abi: FACTORY_ABI,
		functionName: 'numGames',
	})) as bigint;
	if (total === 0n) return [];
	return (await reader.readContract({
		address: factory,
		abi: FACTORY_ABI,
		functionName: 'getGames',
		args: [0n, total],
	})) as readonly `0x${string}`[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * THE WORLD'S TABLE: the one its record names, checked against the chain; or
 * the one the factory holds from this creator when there is no record; or a
 * new one, created and recorded.
 */
export async function openOfflineTable(params: {
	reader: Reader;
	creator: OfflineTableCreator;
	/** The game's factory and lobby implementation, in this world's records. */
	factory: `0x${string}`;
	implementation: `0x${string}`;
	storage: Pick<Storage, 'getItem' | 'setItem'>;
	/** Where the table's address is kept: the world's, beside its chain id. */
	storageKey: string;
	seats: number;
	cycles: number;
	gameOptions: `0x${string}`;
}): Promise<OfflineTableOpening> {
	const {reader, creator, factory, implementation, storage} = params;
	const created = await tablesOf(reader, factory);

	async function checked(
		address: `0x${string}`,
		fresh: boolean,
	): Promise<OfflineTableOpening> {
		const resolution = await resolveTable(reader, address, implementation);
		if (resolution.kind !== 'table') {
			return {kind: 'incoherent', reason: resolution.reason};
		}
		const roster = await readRoster(reader, address);
		if (!same(roster.creator, creator.address)) {
			return {
				kind: 'incoherent',
				reason: "The world's table was created by someone else.",
			};
		}
		return {kind: 'table', table: resolution.table, created: fresh};
	}

	const stored = storage.getItem(params.storageKey);
	if (stored !== null) {
		if (!isAddress(stored)) {
			return {kind: 'incoherent', reason: 'The stored table is no address.'};
		}
		if (!created.some((table) => same(table, stored))) {
			return {
				kind: 'incoherent',
				reason: "The world's chain holds no such table.",
			};
		}
		return checked(stored, false);
	}

	// NO RECORD, AND A TABLE: one mined before its record could be written.
	for (const address of [...created].reverse()) {
		const roster = await readRoster(reader, address);
		if (same(roster.creator, creator.address)) {
			storage.setItem(params.storageKey, address);
			return checked(address, false);
		}
	}

	const hash = await creator.writeContract({
		address: factory,
		abi: FACTORY_ABI,
		functionName: 'createGame',
		args: [params.seats, params.cycles, params.gameOptions],
	});
	const receipt = await reader.waitForTransactionReceipt({hash});
	const [event] = parseEventLogs({
		abi: FACTORY_ABI,
		logs: receipt.logs,
		eventName: 'GameCreated',
	});
	if (receipt.status !== 'success' || !event) {
		throw new Error("The world's table was not created.");
	}
	// RECORDED AT ONCE, before anything is staked at it (OT1-3).
	storage.setItem(params.storageKey, event.args.game);
	return checked(event.args.game, true);
}

/**
 * START THE TABLE, unless it has started: by its creator, once every seat is
 * taken (OT1-6), so the page opens on its first cycle and the table's own
 * lobby screen, with its Start button and its invite link, is never shown
 * offline. Answers whether it sent the start.
 */
export async function startOfflineTableOnce(params: {
	reader: Reader;
	creator: OfflineTableCreator;
	table: `0x${string}`;
}): Promise<boolean> {
	const roster = await readRoster(params.reader, params.table);
	if (roster.started) return false;
	const hash = await params.creator.writeContract({
		address: params.table,
		abi: LOBBY_ABI,
		functionName: 'start',
	});
	const receipt = await params.reader.waitForTransactionReceipt({hash});
	if (receipt.status !== 'success') {
		throw new Error("The world's table could not be started.");
	}
	return true;
}

/** The world's chain, as viem wants it for a client over the world's provider. */
export type OfflineTableChain = {
	id: number;
	name: string;
	nativeCurrency: {name: string; symbol: string; decimals: number};
	rpcUrls: {default: {http: string[]}};
};

/**
 * THE FIRST PERSON'S ACCOUNT, AS THE TABLE'S CREATOR: a wallet client over the
 * world's own wallet, which signs for it without asking (it holds the key).
 * Not the browser's key, which does not exist yet when the table is set.
 */
export function offlineTableCreator(
	wallet: Pick<EmbeddedWallet, 'accounts' | 'handle'>,
	chain: OfflineTableChain,
): OfflineTableCreator {
	const address = wallet.accounts[0];
	const client = createWalletClient({
		account: address,
		chain,
		transport: custom(
			(
				wallet.handle.walletProvider as unknown as {
					underlyingProvider: {request: (args: never) => Promise<unknown>};
				}
			).underlyingProvider as never,
		),
	});
	return {
		address,
		writeContract: (request) =>
			client.writeContract({...request, account: address} as never),
	};
}

/**
 * SET THE WORLD'S TABLE: open it (`openOfflineTable`), have the game stake
 * every seat at it (its `stake`, which asks the chain seat by seat, as a
 * world's stake does), and start it once (`startOfflineTableOnce`). Each step
 * asks the chain first, so a reload or a boot interrupted half way repeats
 * nothing. A record the chain does not hold is answered as `incoherent`, with
 * nothing staked or started.
 */
export async function seatTheOfflineTable(params: {
	reader: Reader;
	creator: OfflineTableCreator;
	factory: `0x${string}`;
	implementation: `0x${string}`;
	storage: Pick<Storage, 'getItem' | 'setItem'>;
	storageKey: string;
	seats: number;
	cycles: number;
	gameOptions: `0x${string}`;
	/** The game's half: every seat staked at the table, unless it is. */
	stake: (table: ResolvedTable) => Promise<void>;
	/** What the boot is doing, for the page that waits on it. */
	onStep?: (what: string) => void;
}): Promise<OfflineTableOpening> {
	const {stake, onStep, ...opening} = params;
	onStep?.('setting the table');
	const opened = await openOfflineTable(opening);
	if (opened.kind !== 'table') return opened;
	onStep?.('staking for everyone at the table');
	await stake(opened.table);
	onStep?.('starting the table');
	await startOfflineTableOnce({
		reader: params.reader,
		creator: params.creator,
		table: opened.table.address,
	});
	return opened;
}

/**
 * HOW THE TABLE'S PANEL NAMES ITS SEATS, as the offline lobby does (OT1-7): the
 * other people at this device by their number, the world's seats as the world,
 * with their level when the game offers levels. The person signed in is "You",
 * as online, which the panel says itself. `identityOf` is the game's: how an
 * account's player is spelled at this table (its address, an avatar id
 * computed from it, or one the chain has to be asked for).
 */
export async function offlineSeatLabels(params: {
	table: Table;
	/** The world's wallet's accounts, in derivation order (a person's index). */
	accounts: readonly `0x${string}`[] | undefined;
	identityOf: (address: `0x${string}`) => bigint | Promise<bigint>;
	levels?: readonly {id: string; label: string}[];
}): Promise<(player: bigint) => string | undefined> {
	const labels = new Map<bigint, string>();
	for (const human of humansAtThisDevice(params.table)) {
		const address = params.accounts?.[human.account];
		if (!address) continue;
		labels.set(await params.identityOf(address), `Player ${human.account + 1}`);
	}
	for (const seat of seatsPlayedByTheWorld(params.table)) {
		const level = params.levels?.find((choice) => choice.id === seat.level);
		labels.set(
			await params.identityOf(seat.address),
			level ? `The world (${level.label})` : 'The world',
		);
	}
	return (player) => labels.get(player);
}

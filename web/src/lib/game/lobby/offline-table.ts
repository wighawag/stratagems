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
 */
import {isAddress, parseEventLogs} from 'viem';
import type {CoreServices} from '$lib/context/core';
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

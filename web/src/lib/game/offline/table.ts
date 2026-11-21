import {readable} from 'svelte/store';
import type {EmbeddedWorld} from '$lib/embedded';
import {embeddedConnectionFactory} from '$lib/embedded/world';
import {mintChainId} from '$lib/embedded/chain-id';
import type {DeploymentsStore} from '$lib/deployments-store';
import type {ResolvedTable, TableLobby} from '$lib/game/lobby/table';
import type {Table} from '$lib/game/lobby/seats';
import {
	offlineTableCreator,
	seatTheOfflineTable,
} from '$lib/game/lobby/offline-table';
import {worldChain, worldReader} from './chain';
import type {OfflineWallet} from './wallet';

/** What a table is created with: how many cycles, and the game's options. */
export type TableAt = {cycles: number; gameOptions: `0x${string}`};

/**
 * WHERE THE GAME IS: the world's `Game`, or the world's TABLE. At a table
 * everything a world composes is composed on the table's record (the lobby's
 * `deploymentsAt`, the game at the table's address), so the context, the
 * revealer, the handover, the played seats and their strategy all play the
 * table; the world's own `Game` stands beside it, and nobody is in it.
 */
export type WhereTheGameIs = {
	records: DeploymentsStore;
	establishConnection: EmbeddedWorld['establishConnection'];
	/** The table, when the world is one: what a game reads its mode or board off. */
	table?: ResolvedTable;
};

/** The world's own `Game`: its records and its connection, as the world built them. */
export function theWorldsGame(world: EmbeddedWorld): WhereTheGameIs {
	return {
		records: world.deployments,
		establishConnection: world.establishConnection,
	};
}

/**
 * THE WORLD'S TABLE, set up and composed on: created by the first person's
 * account through the world's own wallet, unless its record (or the factory)
 * has it; every seat staked at it, unless its reserve there is funded; started,
 * unless it has (`$lib/game/lobby/offline-table`'s `seatTheOfflineTable`,
 * around the game's own `stake`). Each step asks the chain, so a reload or an
 * interrupted boot repeats nothing. Then the records and the connection the
 * world composes everything else on, at the table.
 *
 * A RECORD THE CHAIN DOES NOT HOLD is refused as an incoherent restore is: a
 * new world under a new id, the old one orphaned (OT1-3). This lets go of the
 * world (its wallet unannounced, the world disposed, a new chain id remembered
 * under `chainIdKey` and the table's record forgotten) and answers
 * `incoherent`, and the game's boot builds again, which opens the new world.
 */
export async function openTheWorldsTable(params: {
	world: EmbeddedWorld;
	wallet: OfflineWallet;
	lobby: TableLobby | undefined;
	table: Table;
	at: TableAt;
	/** The game's half: every seat staked at the table, unless it is. */
	stake: (opened: ResolvedTable) => Promise<void>;
	/** Where the world's chain id is remembered (the game's key, a wire). */
	chainIdKey: string;
	/** Where the table's address is remembered (the game's key, a wire). */
	storageKey: string;
	onStep?: (what: string) => void;
	/** Defaults to `localStorage`. */
	storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}): Promise<
	| {kind: 'incoherent'; reason: string}
	| ({kind: 'table'; table: ResolvedTable} & WhereTheGameIs)
> {
	const {world, lobby} = params;
	const storage = params.storage ?? localStorage;
	const wallet = params.wallet.current();
	if (!wallet || !lobby) {
		throw new Error('an offline table needs the world’s wallet and tables');
	}
	const records = world.deployments.get();
	const opened = await seatTheOfflineTable({
		reader: worldReader(world) as never,
		creator: offlineTableCreator(wallet, worldChain(world)),
		factory: lobby.factory(records).address,
		implementation: lobby.implementation(records).address,
		storage,
		storageKey: params.storageKey,
		seats: params.table.length,
		cycles: params.at.cycles,
		gameOptions: params.at.gameOptions,
		stake: params.stake,
		...(params.onStep ? {onStep: params.onStep} : {}),
	});
	if (opened.kind === 'incoherent') {
		console.warn(`the offline world's table was refused: ${opened.reason}`);
		params.wallet.stop();
		await world.dispose();
		params.onStep?.('starting a new world');
		storage.setItem(params.chainIdKey, String(mintChainId()));
		storage.removeItem(params.storageKey);
		return opened;
	}
	const atTable = lobby.deploymentsAt(records, opened.table);
	const recordsAtTable = {
		...readable(atTable),
		get: () => atTable,
	} as DeploymentsStore;
	return {
		kind: 'table',
		table: opened.table,
		records: recordsAtTable,
		establishConnection: embeddedConnectionFactory({
			chainId: world.chainId,
			node: {provider: world.provider},
			deployments: recordsAtTable,
			wallets: [wallet.handle],
		}),
	};
}

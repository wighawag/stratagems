import {deleteWorldIndex} from '$lib/indexer';

/**
 * Which world's index this browser holds, so that the index of a world the
 * lobby forgot is deleted when the next one starts. Its own key, because the
 * lobby, byte-identical across games, knows nothing of an index. A WIRE, in
 * the namespace of everything else a world keeps.
 */
export const INDEXED_CHAIN_ID_STORAGE_KEY = 'offline-world:indexed-chain-id';

/**
 * A STEP OF AN OFFLINE WORLD THAT IS INDEXED (K2-9): delete the index of the
 * world this browser indexed before, when it is not the one starting now (the
 * lobby forgot it, or its restore was incoherent and a new id was minted), and
 * remember the one starting. Called once the world is open, with its chain id.
 *
 * Best-effort and not awaited: a database a stopping worker still holds blocks
 * its deletion until it lets go, and a world's boot is not worth holding for
 * the cleanup of the one before it. `prefix` is the game's indexer prefix, the
 * one its processor's databases are named under.
 */
export function forgetPreviousWorldIndex(params: {
	prefix: string;
	chainId: number;
	/** Defaults to `localStorage`. */
	storage?: Pick<Storage, 'getItem' | 'setItem'>;
	/** Defaults to `$lib/indexer`'s `deleteWorldIndex` (tests replace it). */
	deleteIndex?: (prefix: string, chainId: number) => Promise<void>;
}): void {
	const storage = params.storage ?? localStorage;
	const deleteIndex = params.deleteIndex ?? deleteWorldIndex;
	const previous = Number(storage.getItem(INDEXED_CHAIN_ID_STORAGE_KEY));
	if (previous && previous !== params.chainId) {
		void deleteIndex(params.prefix, previous).catch((err) =>
			console.warn('could not delete a forgotten world\u2019s index', err),
		);
	}
	storage.setItem(INDEXED_CHAIN_ID_STORAGE_KEY, String(params.chainId));
}

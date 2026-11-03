/**
 * A PLAYED SEAT'S STRATEGY: what a seat the world plays decides to do with its
 * turn, behind a seam a game fills.
 *
 * WHERE IT IS CALLED FROM, which is the first thing to know. Not from
 * `./played`, which deliberately has no shared pass (how a turn is derived,
 * whether a reveal is one call or a chain, and what settling costs still
 * differ between games), but from each game's own pass, at the point where it
 * asks a seat for the turn to commit. What the framework supplies is the seam
 * ({@link Strategy}), a random source a test can reproduce
 * ({@link seededRandom}), a store for the decided turn
 * ({@link createPlayedTurnStore}) and the few lines that tie them together
 * ({@link decidePlayedTurn}), so a game's pass gains a call rather than a
 * mechanism.
 *
 * WHY THE TURN IS STORED AND NOT RE-DERIVED. A seat that plays today's derived
 * turn rebuilds it from (chain, game, identity, cycle) whenever it needs it,
 * and that is what lets a reload open a commitment it made before. A turn that
 * depends on the BOARD cannot be rebuilt that way: by the reveal phase the
 * board holds this cycle's earlier reveals, so the same strategy run again may
 * answer differently and build a head the chain is not holding. So the decided
 * turn is written down, synchronously, BEFORE the commit is sent, and the
 * reveal and the settlement read it back. A write that throws sends nothing,
 * which is the order that makes "committed" imply "stored".
 *
 * THE SECRET STAYS DERIVED (`./secret`'s `playedSeatSecret`), so only the
 * actions are stored, and the derived turn stays a candidate beside the
 * stored one: a game's pass keeps letting the head on chain decide which turn
 * it is holding, exactly as it did with two candidates.
 *
 * WHAT A STRATEGY SEES (the plan's PA6, honest by construction): its own
 * identity, the cycle, its level, a seeded random source and what it can
 * afford. The board and the game's simulation are captured by the game's own
 * factory, which is handed a public client and a sandbox and nothing of the
 * page: no context, no submission, no handover. Commitments hide the people's
 * turns, so when a seat decides does not matter.
 */
import {encodePacked, keccak256} from 'viem';
import type {SubmissionStorageFormat} from './commit-reveal/storage';

/**
 * A level every world seat may have, and the one it has unless somebody chose
 * another: TODAY'S DERIVED TURN, which stores nothing. A game's pass plays it
 * without calling a strategy at all.
 */
export const RANDOM_LEVEL = 'random';

/** A level a game offers, for whatever renders the choice. */
export type AiLevel = {id: string; label: string};

/**
 * A random source that reproduces: the same seat, cycle, chain and game give
 * the same sequence, so a test can replay a game and two seats do not move
 * alike. NOT a wire, because the turn it helps decide is stored.
 */
export type SeededRandom = {
	/** The next 256 bits. */
	next(): bigint;
	/** A whole number in `[0, n)`, for a positive whole `n`. */
	below(n: number): number;
};

export function seededRandom(params: {
	chainId: number;
	contract: `0x${string}`;
	identity: bigint;
	cycleNumber: number;
}): SeededRandom {
	let counter = 0n;
	function next(): bigint {
		const value = BigInt(
			keccak256(
				encodePacked(
					['string', 'uint256', 'address', 'uint256', 'uint64', 'uint256'],
					[
						'PlayedSeat:random',
						BigInt(params.chainId),
						params.contract,
						params.identity,
						BigInt(params.cycleNumber),
						counter,
					],
				),
			),
		);
		counter++;
		return value;
	}
	return {
		next,
		below(n: number): number {
			if (!Number.isInteger(n) || n < 1) {
				throw new Error(
					`seededRandom.below needs a positive whole number, not ${n}`,
				);
			}
			// 256 bits against a number that fits a JS integer: the bias of the
			// modulo is below anything a test or a player could see.
			return Number(next() % BigInt(n));
		},
	};
}

/**
 * THE SEAM: a seat's turn, given who it is, when, how well it plays, a random
 * source and what it can afford. What a board is and how a candidate is scored
 * are the game's, captured by the factory that builds this.
 */
export type Strategy<TAction> = (input: {
	identity: bigint;
	cycleNumber: number;
	/** The seat's level, one of the ids the game offers. */
	level: string;
	random: SeededRandom;
	budget: {
		/** The most actions the seat can pay for this cycle. */
		actionsAtMost: number;
	};
}) => Promise<readonly TAction[]>;

/**
 * How many cycles of turns are kept per identity. A turn is needed until its
 * reveal or its settlement, which a manual world reaches within one cycle and a
 * timed one within the next; three leaves room and stays small.
 */
export const COMMITTED_TURNS_KEPT = 3;

/** What the store needs of `localStorage`. */
export type PlayedTurnStorage = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
};

export type PlayedTurnStore<TAction> = {
	/** The turn decided for this identity in this cycle, if one was stored. */
	get(identity: bigint, cycleNumber: number): readonly TAction[] | undefined;
	/**
	 * Store the turn decided for this identity in this cycle, SYNCHRONOUSLY.
	 * Throws when the storage refuses, which a caller that stores before it
	 * commits turns into a commit that is never sent.
	 */
	put(identity: bigint, cycleNumber: number, actions: readonly TAction[]): void;
};

/**
 * ONE RECORD, as written. THE KEY AND THIS SHAPE ARE A WIRE from their first
 * build (`AGENTS.md`, "Commit-reveal rules"): a record a later build cannot
 * read is a seat that cannot open its commitment. Identities are decimal
 * strings, because a bigint has no JSON form; the actions are in the game's own
 * `SubmissionStorageFormat`, the codec its submissions already use.
 */
type StoredPlayedTurn = {
	chainId: number;
	contract: string;
	identity: string;
	cycleNumber: number;
	actions: unknown[];
};

function isRecord(value: unknown): value is StoredPlayedTurn {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.chainId === 'number' &&
		typeof record.contract === 'string' &&
		typeof record.identity === 'string' &&
		/^\d+$/.test(record.identity) &&
		typeof record.cycleNumber === 'number' &&
		Number.isInteger(record.cycleNumber) &&
		Array.isArray(record.actions)
	);
}

/**
 * The played seats' turns, kept in `localStorage` under a key the WORLD names,
 * beside its other records: a storage that lost this has lost the world's chain
 * id too, so the record shares the world's fate (rather than an account data per
 * seat, which would be synced nowhere and encrypted with a key that is public).
 *
 * ONE RECORD PER (chain id, contract, identity, cycle), the last
 * {@link COMMITTED_TURNS_KEPT} cycles kept per identity. Records of another
 * chain id are dropped when the store is created, which is when the world
 * boots: they describe a world nothing points at any more. A record it cannot
 * read is ignored, never thrown on.
 */
export function createPlayedTurnStore<TAction>(params: {
	storage: PlayedTurnStorage;
	key: string;
	chainId: number;
	contract: `0x${string}`;
	format: SubmissionStorageFormat<TAction>;
	kept?: number;
}): PlayedTurnStore<TAction> {
	const {storage, key, chainId, format} = params;
	const contract = params.contract.toLowerCase();
	const kept = params.kept ?? COMMITTED_TURNS_KEPT;

	function read(): StoredPlayedTurn[] {
		const raw = storage.getItem(key);
		if (raw === null) return [];
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
		} catch {
			return [];
		}
	}

	function write(records: StoredPlayedTurn[]): void {
		storage.setItem(key, JSON.stringify(records));
	}

	// AT BOOT: another chain's records, and anything unreadable, go.
	{
		const raw = storage.getItem(key);
		if (raw !== null) {
			const records = read();
			const ours = records.filter((record) => record.chainId === chainId);
			if (JSON.stringify(ours) !== raw) {
				try {
					write(ours);
				} catch (err) {
					// Tidying is never worth failing a boot for: what is unreadable
					// is ignored by every read anyway.
					console.warn('the played turns could not be tidied', err);
				}
			}
		}
	}

	function sameSeat(record: StoredPlayedTurn, identity: bigint): boolean {
		return (
			record.chainId === chainId &&
			record.contract.toLowerCase() === contract &&
			record.identity === identity.toString()
		);
	}

	return {
		get(identity, cycleNumber) {
			const record = read().find(
				(candidate) =>
					sameSeat(candidate, identity) &&
					candidate.cycleNumber === cycleNumber,
			);
			if (!record) return undefined;
			try {
				return record.actions.map((action) => format.decode(action));
			} catch {
				return undefined;
			}
		},
		put(identity, cycleNumber, actions) {
			const others = read().filter(
				(record) =>
					!(sameSeat(record, identity) && record.cycleNumber === cycleNumber),
			);
			const mine = others
				.filter((record) => sameSeat(record, identity))
				.map((record) => record.cycleNumber)
				.concat(cycleNumber)
				.sort((a, b) => b - a)
				.slice(0, kept);
			const records = others.filter(
				(record) =>
					!sameSeat(record, identity) || mine.includes(record.cycleNumber),
			);
			if (mine.includes(cycleNumber)) {
				records.push({
					chainId,
					contract,
					identity: identity.toString(),
					cycleNumber,
					actions: actions.map((action) => format.encode(action)),
				});
			}
			write(records);
		},
	};
}

/**
 * A seat's turn for this cycle: the stored one if there is one, else the
 * strategy's, STORED BEFORE IT IS HANDED BACK, so a caller that commits what
 * this returns has always stored it first. Asked once per cycle per seat: every
 * later pass of the same cycle reads the store.
 *
 * Call it in the COMMIT phase only. In the reveal phase the board holds this
 * cycle's earlier reveals, so deciding then is deciding a different turn; a
 * pass there reads the store and nothing else.
 */
export async function decidePlayedTurn<TAction>(params: {
	store: PlayedTurnStore<TAction>;
	strategy: Strategy<TAction>;
	identity: bigint;
	cycleNumber: number;
	level: string;
	random: SeededRandom;
	budget: {actionsAtMost: number};
}): Promise<readonly TAction[]> {
	const {store, strategy, identity, cycleNumber} = params;
	const stored = store.get(identity, cycleNumber);
	if (stored) return stored;
	const actions = await strategy({
		identity,
		cycleNumber,
		level: params.level,
		random: params.random,
		budget: params.budget,
	});
	store.put(identity, cycleNumber, actions);
	return actions;
}

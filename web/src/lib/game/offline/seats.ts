import type {Occupant, Table} from '$lib/game/lobby/seats';

/** A seat the world stakes for: who is in it, at which index, and the address that plays it. */
export type StakedSeat = {
	player: `0x${string}`;
	/** The seat's index at the table, which a game may spell an identity with. */
	seat: number;
	occupant: Exclude<Occupant, {kind: 'remote-human'}>;
};

/**
 * GIVE EVERY SEAT AT THE TABLE SOMETHING TO LOSE: the walk, with the game's
 * stake at each seat.
 *
 * A WALK OF THE TABLE rather than a loop over a key list, which is where the
 * seat model earns its keep: this stakes for whoever is in each seat, so the
 * day a seat holds a second human it is staked for by this same line. The
 * person here is `you`, each other person at this device (hotseat) the
 * account of the world's wallet at their index, each world seat the key it
 * holds. A remote human stakes for themselves, at a table online; an offline
 * world has none.
 *
 * THE OTHER SEATS ARE NOT A COURTESY. A stake is what enrols a player as a
 * waited-for member, so this walk is what makes unanimity mean something; and
 * it is what they lose by going quiet, which is what makes their commitments
 * worth making. They are given exactly what the human is given and nothing
 * more, so what the world can do, the human can do.
 *
 * `stake` is the game's: what a seat is staked with, in the world or at a
 * table, and the check of the chain that it has none yet (a stake refilled by
 * a reload is not a stake). It is told the SEAT INDEX as well as the address,
 * because a game may spell a seat's identity with it (bomber-world draws each
 * seat's character by its seat). Seats are staked one after another, in seat
 * order.
 */
export async function stakeEverySeat(params: {
	table: Table;
	/** The human's address, which only exists once a wallet has been announced. */
	you: `0x${string}`;
	/**
	 * Every account of the world's wallet, in seat order, for the other people
	 * at this device (hotseat): a `local-human` seat is the account at its index.
	 */
	humans?: readonly `0x${string}`[];
	stake: (seat: StakedSeat) => Promise<void>;
}): Promise<void> {
	for (const [seat, {occupant}] of params.table.entries()) {
		if (occupant.kind === 'remote-human') continue;
		const player =
			occupant.kind === 'you'
				? params.you
				: occupant.kind === 'local-human'
					? params.humans?.[occupant.account]
					: occupant.address;
		if (!player) {
			throw new Error('a person at this device has no account to stake for');
		}
		await params.stake({player, seat, occupant});
	}
}

/**
 * A seat the world plays, as its loop takes it: the key, the identity the
 * contract spells, the level (absent means `random`). The shape of a game's
 * `OfflinePlayer` (its `offline-players.ts`), which this is assigned to.
 */
export type PlayedSeat = {
	privateKey: `0x${string}`;
	identity: bigint;
	level?: string;
};

/**
 * THE SEATS THE WORLD PLAYS, with the identity each of their keys plays as, in
 * seat order.
 *
 * `identityOf` is the game's: how an address becomes a player there (the
 * account widened to a number, an avatar id computed from it, or one the chain
 * has to be asked for). It is told the SEAT INDEX too, for a game whose
 * identity depends on the seat. Walked with the index rather than through
 * `seatsPlayedByTheWorld`, which drops it: same seats, same order.
 */
export async function resolvePlayedSeats(params: {
	table: Table;
	identityOf: (seat: {
		player: `0x${string}`;
		seat: number;
	}) => bigint | Promise<bigint>;
}): Promise<readonly PlayedSeat[]> {
	const played: PlayedSeat[] = [];
	for (const [seat, {occupant}] of params.table.entries()) {
		if (occupant.kind !== 'the-world') continue;
		played.push({
			privateKey: occupant.privateKey,
			identity: await params.identityOf({player: occupant.address, seat}),
			...(occupant.level !== undefined ? {level: occupant.level} : {}),
		});
	}
	return played;
}

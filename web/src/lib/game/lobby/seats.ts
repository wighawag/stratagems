import {bytesToHex} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';

/**
 * HOW MANY SEATS ARE AT THE TABLE, AND WHO IS IN EACH ONE.
 *
 * A SEAT, NOT A PLAYER COUNT, and that is the whole of the design rather than
 * a flourish. A count answers "how many", which is the question a lobby asks
 * today; a seat answers "who is there", which is the question every later
 * question turns out to be. A seat has an OCCUPANT, and today an occupant is
 * either YOU or THE WORLD. That is all it is now, and it is what makes hotseat
 * additive rather than a redesign: a second human is a third kind of occupant,
 * and nothing else here has to move - `tableOf` still lays the seats out, the
 * provisioning still walks the table asking each occupant for an address, and
 * the lobby still chooses how many there are.
 *
 * WHAT A SEAT IS NOT is a setting on a live game. What ENROLS a player is being
 * given whatever this game puts at stake, which happens once, while the game is
 * being set up: the contract starts waiting for whoever holds it. So the number
 * of seats is baked in at the moment the game boots, and changing it means a
 * NEW game rather than a setting - see `./lobby`, which is where that is
 * enforced.
 *
 * NOTHING HERE KNOWS WHAT A SEAT HOLDS. A lobby chooses how many people are at
 * the table; what each of them is given, and how this game spells who they are,
 * belongs to the game's own world builder, which is the one file that is
 * allowed to know.
 *
 * WHICH IS WHY THIS IS FRAMEWORK RATHER THAN A FILE THAT ASKS TO BE COPIED. It
 * used to live in the app namespace and assert in prose that it was
 * byte-identical in every game that had one, which is a claim a reader has to
 * verify by grepping two repos. Two games have now been measured against it and
 * it held; moving it here makes the claim structural, and the one thing it
 * imports is `viem`.
 */

/**
 * The keys the world plays with, and they are PUBLIC AND FIXED on purpose -
 * the same argument a world builder already makes for its deployer and its
 * admin.
 *
 * These are hardhat's well-known development accounts, derived from the
 * mnemonic every tool in this ecosystem ships with. There is nothing to
 * protect: the chain exists only in this tab, it has no bridge to anywhere,
 * and its ether is a number a cheat call sets. Generating a key per world
 * would buy no security and would cost the one thing that matters - a world's
 * players would be different addresses between runs, so nothing about a world
 * could be written down or reasoned about.
 *
 * ONE PUBLIC FACT RATHER THAN THIRTY-SIX. Writing the keys out would be
 * eighteen pairs of opaque hex, which is eighteen chances for a cascade to
 * halve the list or transpose a digit; the mnemonic and an index are the same
 * information with one thing to get wrong.
 *
 * AND THE ADDRESSES ARE A WIRE, in exactly `AGENTS.md`'s sense. A world that
 * has booted has these addresses ENROLLED on chain, holding this game's stake;
 * a build that derived different ones would restore that world and find its
 * members unreachable - the cycle would wait forever for players nobody holds
 * a key for, and under the manual policy waiting forever is what it does. So
 * this derivation is not an implementation detail to tidy:
 * `test/lib/game/lobby/seats.test.ts` pins the first addresses against the ones
 * the world has been playing as.
 */
const WELL_KNOWN_MNEMONIC =
	'test test test test test test test test test test test junk';

/**
 * Where the world's own players start in that list.
 *
 * Two, because a world builder that deploys with these same well-known accounts
 * signs with #0 and administers with #1, which both worlds in this tree do. An
 * overlap would make the deployer a member of the game it deployed, which is
 * not wrong so much as impossible to reason about the first time a balance
 * looks strange.
 */
const FIRST_PLAYED_ACCOUNT = 2;

/** Who is in a seat. */
export type Occupant =
	/**
	 * The human at this browser. Exactly one seat has this occupant, and it has
	 * no key here: the player plays through the wallet the world announces (see
	 * `lib/embedded/wallet.ts`), whose account is not known until the world has
	 * booted and handed it over.
	 */
	| {kind: 'you'}
	/**
	 * The world itself, playing a key it holds.
	 *
	 * What it DOES with that key is the loop that plays it, and that loop is
	 * deliberately the smallest thing that gives a cycle somebody to wait for:
	 * no intelligence, no difficulty, no interface. The NPCs the plan's Phase 6
	 * wants are a different job.
	 */
	| {kind: 'the-world'; privateKey: `0x${string}`; address: `0x${string}`};

/** One place at the table. */
export type Seat = {occupant: Occupant};

/** Everyone the cycle will wait for, in seat order. */
export type Table = readonly Seat[];

/**
 * THE FLOOR, and it is three rather than two for a reason the contract can be
 * made to demonstrate.
 *
 * One waited-for member satisfies unanimity by existing: the commit phase
 * hides nothing, and an advance never has to refuse anybody, so two of the
 * three things it exists to enforce cannot be reached at all. Two is a duel,
 * where "everyone" and "the other one" are the same statement, and whatever
 * two players contest is a special case rather than an instance of the rule. At
 * three the order-independence property has something to say.
 *
 * So a table of three is the smallest thing that is a commit-reveal game
 * rather than a demonstration of one, and it is also the default: what the
 * lobby offers above it is more company, not more correctness.
 */
export const FEWEST_SEATS = 3;

/** What a player gets if they never touch the chooser. See {@link FEWEST_SEATS}. */
export const SEATS_BY_DEFAULT = 3;

/**
 * THE CEILING, and it is deliberately NOT "however many keys the list holds".
 *
 * The supply is eighteen (hardhat's accounts #2 to #19), so the key list is
 * not the bound and must not be allowed to become the reason. What bounds a
 * table is what a ROUND COSTS, and that turned out not to be the arithmetic
 * anybody would have predicted.
 *
 * THE ARITHMETIC SAYS IT SHOULD BE FREE. The world acts for its players one at
 * a time (the loop that plays them says why: they share one chain in one worker,
 * and a burst of commits is a burst of blocks nobody is waiting for), so a
 * table of N costs 2(N-1) transactions in series per round plus two advances -
 * and a transaction on a chain in a tab is 15 to 20 ms. Eighteen of them is a
 * third of a second.
 *
 * AND IT IS NOW FREE, WHICH IT WAS NOT WHEN THIS NUMBER WAS FIVE. This used to
 * be a staircase in whole poll intervals: four and five seats paid 1.33 s for
 * their first round and six and eight paid 3.8-4.4 s for every round, because
 * the `advanceCycle` that opens the reveal phase SUCCEEDED on chain, emitted
 * `CycleAdvanced`, and left the chain still reporting the commit phase when
 * asked. The cause
 * was not the seats and not the transactions: `webevm` ran everything that
 * executes - transactions AND `eth_call` - on one state manager with one
 * checkpoint stack, and nothing serialised them, so whichever of two
 * overlapping executions reverted its checkpoint last discarded what the other
 * had committed. What a table of N really bought was more traffic in flight
 * while the world's writes executed, and the staircase was the probability of
 * that overlap crossing one.
 *
 * `webevm` 0.6.0 serialises the node's whole public surface (its ADR 0012),
 * and that is what this number now rests on. Re-measured the same way,
 * headless chromium, production build, load ~1.1, five runs of six rounds
 * each, counting every steady round rather than quoting a range:
 *
 * | seats | boot | a steady round | rounds over 500 ms |
 * |---|---|---|---|
 * | 3 | 348-350 ms | median 228 ms | 0/25 |
 * | 5 | 318-364 ms | median 221 ms | 0/25 |
 * | 8 | 339-352 ms | median 223 ms | 0/25 |
 * | 10 | 350-377 ms | median 232 ms | **0/56** |
 * | 11 | 353-836 ms | median 231 ms | 4/56 |
 * | 12 | 824-841 ms | median 235 ms | 2/25 |
 * | 16 | 833-845 ms | median 330 ms | 5/25 |
 * | 19 | 823-846 ms | median 334 ms | 10/25 |
 *
 * The staircase is gone and so is the anomalous first round: the median is
 * flat at about 230 ms from three seats to twelve, which is the arithmetic
 * this file predicted all along.
 *
 * SO TEN, AND IT IS STILL A MEASUREMENT RATHER THAN A PRINCIPLE. Ten is the
 * largest table at which every round measured was steady - 56 of 56, against
 * 4 of 56 already slow at eleven - and what goes wrong above it is the old
 * shape without the old cause: a pass over that many members occasionally
 * outlasts the poke that would have ended the round, so the round waits out a
 * one-second backstop instead. That is a latency budget, not a lost write, and
 * whoever wants a bigger table should spend it on the poke rather than on this
 * constant.
 *
 * IT IS STILL DELIBERATELY NOT THE KEY SUPPLY. That is eighteen (hardhat's
 * accounts #2 to #19), so a table of nineteen is derivable and measurably
 * worse: ten of twenty-five rounds over half a second. The key list was never
 * the bound and must not become the reason.
 */
export const MOST_SEATS = 10;

/** Every table size the lobby offers, for whatever renders the choice. */
export const SEAT_CHOICES: readonly number[] = Array.from(
	{length: MOST_SEATS - FEWEST_SEATS + 1},
	(_, i) => FEWEST_SEATS + i,
);

/**
 * Bring any number into range.
 *
 * TOTAL, because the inputs are not trustworthy: one comes out of
 * `localStorage`, where a previous build (or a person with a console) may have
 * left anything, and the other comes from a control. A stored count that is
 * out of range is not repaired into something meaningful, it is clamped, which
 * is the same answer the chain-id store gives to a stored id it could not have
 * minted: carry on with something this code can reason about.
 */
export function clampSeats(seats: unknown): number {
	const parsed =
		typeof seats === 'number'
			? seats
			: typeof seats === 'string'
				? Number(seats)
				: Number.NaN;
	if (!Number.isFinite(parsed)) return SEATS_BY_DEFAULT;
	const whole = Math.floor(parsed);
	if (whole < FEWEST_SEATS) return FEWEST_SEATS;
	if (whole > MOST_SEATS) return MOST_SEATS;
	return whole;
}

/** Cached, because deriving an HD account is elliptic-curve work. */
const played: {privateKey: `0x${string}`; address: `0x${string}`}[] = [];

function playedKey(index: number): {
	privateKey: `0x${string}`;
	address: `0x${string}`;
} {
	const existing = played[index];
	if (existing) return existing;
	const account = mnemonicToAccount(WELL_KNOWN_MNEMONIC, {
		addressIndex: FIRST_PLAYED_ACCOUNT + index,
	});
	const key = account.getHdKey().privateKey;
	// Cannot happen for an account derived from a mnemonic, and worth saying so
	// rather than casting: a player with no key is a member the cycle waits for
	// and nobody can act for, which under the manual policy is a frozen world.
	if (!key) {
		throw new Error(
			`the world could not derive a key for the player in seat ${index + 1}`,
		);
	}
	const derived = {privateKey: bytesToHex(key), address: account.address};
	played[index] = derived;
	return derived;
}

/**
 * Lay out a table of `seats`.
 *
 * SEAT ONE IS YOURS, always, and the rest are the world's. That is a fact
 * about today's two occupants rather than a rule: when a seat can hold a
 * second human, this is the one function that changes, and it changes by
 * taking what each seat holds as an argument instead of assuming it.
 */
export function tableOf(seats: number): Table {
	const count = clampSeats(seats);
	const table: Seat[] = [{occupant: {kind: 'you'}}];
	for (let index = 0; index < count - 1; index++) {
		table.push({occupant: {kind: 'the-world', ...playedKey(index)}});
	}
	return table;
}

/**
 * The seats the world plays, in seat order.
 *
 * A walk of the TABLE rather than a slice of the key list, which is the whole
 * reason the seat model earns its keep: every caller that has to do something
 * per member (fund it, stake for it, play it) asks the table who is there
 * instead of assuming that everyone except seat one is the world's.
 */
export function seatsPlayedByTheWorld(
	table: Table,
): readonly {privateKey: `0x${string}`; address: `0x${string}`}[] {
	const world: {privateKey: `0x${string}`; address: `0x${string}`}[] = [];
	for (const seat of table) {
		if (seat.occupant.kind === 'the-world') {
			world.push({
				privateKey: seat.occupant.privateKey,
				address: seat.occupant.address,
			});
		}
	}
	return world;
}

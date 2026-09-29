/**
 * The stratagems state, declared as entities (`@etherfold/processor-entities`).
 *
 * The declarations are etherfold's stratagems conformance workload's
 * (`packages/conformance-workload-stratagems/src/entities.ts`), which that
 * repository checks, on every backend, against the state the ORIGINAL JS processor
 * of this repository computed from alpha1's 31,332 real logs. The comments below are
 * that file's, because they record why each entity has the shape it has.
 *
 * What the old JS state object held, and where it lives now:
 *
 *   state.cells[position]                 -> `cell`
 *   state.owners[position]                -> `cellOwner`
 *   state.commitments[account]            -> `commitment`
 *   state.placements[] (newest first, 7)  -> `placement` + its `players` (`placementPlayer`)
 *   state.points.global                   -> `globalRate` (one row, id `singleton`)
 *   state.points.fixed[account]           -> `fixedRate`
 *   state.points.shared[account]          -> `sharedRate`
 *   state.computedPoints[owner]           -> `computedPoints`
 *
 * `web/` reads them through GraphQL (`./queries.ts`), which is built from these
 * declarations, so a field renamed here is a query that stops validating there.
 */
import {declareEntities} from '@etherfold/processor-entities';

/** The one row of a singleton entity. See `globalRate`. */
export const SINGLETON = {id: 'singleton'} as const;

/**
 * The parent of the placement window's children: a singleton needs an invented
 * id, which is what the subgraph model does too.
 */
export const WINDOW = 'global';

/** The bound `state.placements` keeps. Verbatim from the original's `> 7`. */
export const PLACEMENT_WINDOW = 7;

/**
 * How many rows a cascade delete walks per round trip.
 *
 * It is a PAGE size and not a bound on the answer: `dropPlacement` keeps listing
 * until the prefix is empty, because a listing that came back `truncated` and
 * was treated as the whole collection is exactly how a cascade leaves orphans.
 * On the real stream the largest arrival has far fewer children than this, so
 * the loop runs once; the loop is there so that it does not have to.
 */
export const CASCADE_PAGE = 256;

/**
 * Fixed-width decimal, so the id's own ascending order is the numeric one.
 *
 * A listing is ordered lexicographically over the STRINGIFIED id (that is the
 * order a key-prefix range scan gives for free on every backend), so `'10'`
 * sorts before `'9'` unless the key is padded. 12 digits covers any block number
 * or log index a chain will produce; the values here are block numbers on Base,
 * currently ten digits.
 */
export function wide(value: number | bigint): string {
	return String(value).padStart(12, '0');
}

/**
 * The arrival ordinal of an event: unique across the stream, ordered by arrival.
 *
 * This is the key that replaces the old port's singleton-holding-a-CSV. Arrival
 * order is NOT recoverable by sorting on `epoch` -- the original unshifts a new
 * epoch at the front and reuses an existing one in place, so the window's order
 * is the order epochs were first SEEN and epochs neither increase nor stay
 * distinct across it -- which is precisely why the old port had to write the
 * order down.
 */
export function arrivalOrdinal(event: {blockNumber: number; logIndex: number}): string {
	return `${wide(event.blockNumber)}:${wide(event.logIndex)}`;
}

/**
 * The arrival ordinal of ONE MOVE inside a revealed commitment.
 *
 * A single `CommitmentRevealed` carries several moves, and two of them can land
 * on the same cell, so the move index is part of what makes the key unique. The
 * original pushes into `cell.players[]`, and push order is arrival order, so
 * ordering by this key reproduces it exactly.
 */
export function moveOrdinal(event: {blockNumber: number; logIndex: number}, moveIndex: number): string {
	return `${arrivalOrdinal(event)}:${wide(moveIndex)}`;
}

export const stratagemsEntities = declareEntities([
	/**
	 * `state.cells[position]`. A keyed map of flat numeric records, which is the
	 * case the model was designed for: it maps across with nothing lost.
	 */
	{
		name: 'cell',
		id: 'position',
		fields: {
			lastEpochUpdate: 'integer',
			epochWhenTokenIsAdded: 'integer',
			color: 'integer',
			life: 'integer',
			delta: 'integer',
			enemyMap: 'integer',
			distribution: 'integer',
			stake: 'integer',
			producingEpochs: 'integer',
		},
	},

	/**
	 * `state.owners[position]`.
	 *
	 * CONTORTION THAT STAYS (finding, contortion 4): a map of position to a
	 * single scalar becomes a whole entity, because the model has no "scalar
	 * keyed by id" shape. Folding `owner` into `cell` looks obvious and is
	 * WRONG: the processor writes `owners[p]` at points where it does not write
	 * `cells[p]`, and `set` writes a WHOLE ROW, so the fold would silently clear
	 * the nine cell fields. That is `set` doing exactly what it promises; the
	 * cost lands as an extra entity plus a second read on every `ownerOf`.
	 */
	{
		name: 'cellOwner',
		id: 'position',
		fields: {owner: 'text'},
	},

	/** `state.commitments[account]`. Deleted on reveal/cancel/void, which `delete` covers. */
	{
		name: 'commitment',
		id: 'account',
		fields: {epoch: 'integer', hash: 'text'},
	},

	/**
	 * `state.placements[]`, an ORDERED, BOUNDED array (unshift, pop past 7).
	 *
	 * The child of a window, keyed by the ARRIVAL of the event that first
	 * introduced its epoch. `{window: 'global'}` is the prefix, so the whole
	 * collection is one bounded listing and there is no stored array, no CSV of
	 * positions and no singleton remembering the order. Eviction reads the
	 * window one row wider than it keeps and drops `rows[0]`, which is the
	 * oldest arrival: the ordering IS the key.
	 *
	 * `epoch` is a FIELD rather than the id, because the original's identity for
	 * a placement is "the entry that was unshifted when this epoch was first
	 * seen", and an epoch can leave the window and come back later as a NEW,
	 * later arrival.
	 */
	{
		name: 'placement',
		id: ['window', 'ordinal'],
		fields: {epoch: 'integer'},
	},

	/**
	 * `state.placements[i].cells[position].players[]`.
	 *
	 * Keyed by `(the placement's whole key, position, arrival of the move)`, which
	 * makes every question the projection and the cascade ask a prefix listing:
	 * every player of an arrival is `{window, ordinal}`, every player of one cell
	 * is `{window, ordinal, position}`, and both come back in push order.
	 *
	 * It is DECLARED a child of `placement` (ADR-0098), and that is why `window` is
	 * in its id: a child's leading id columns must be its parent's WHOLE id, so an
	 * id starting at `ordinal` (the parent's key minus `window`) is refused at
	 * declaration time. With a single window the extra column changes no answer,
	 * and the golden comparison is what says so.
	 *
	 * There is deliberately NO `placementCell` entity. In the original a cell is
	 * created only in order to push a player into it, so it never exists empty,
	 * so the set of cells of a placement is exactly the set of positions among
	 * its players: derived, not stored. The old port's `playerCount` on that
	 * entity was contortion 2, and it existed only because the child's id ended
	 * in a dense array index.
	 */
	{
		name: 'placementPlayer',
		id: ['window', 'ordinal', 'position', 'moveOrdinal'],
		fields: {color: 'integer', address: 'text'},
		parent: {entity: 'placement', as: 'players'},
	},

	/**
	 * `state.points.global`, a SINGLETON.
	 *
	 * `totalRewardPerPointAtLastUpdate` and `totalPoints` are `uint256`, declared
	 * as the semantic type `u256` beside the `blob` storage class (ADR-0098). This
	 * was contortion 5 of the finding: with only text/integer/real/blob and a
	 * 64-bit SQLite INTEGER, a u256 had to be decimal TEXT, read back through
	 * `BigInt()`, and its equality depended on an encoding rule (decimal, no
	 * leading zeros, never hex) nothing in the model stated or enforced. That is
	 * not academic on this workload: 16,046 of the 31,332 real events write
	 * nothing but u256 fields. Now the declaration states it: a handler writes a
	 * `bigint`, every read answers one, every backend holds its one canonical
	 * encoding (32 big-endian bytes), and a value the type does not admit is
	 * refused at write rather than stored.
	 *
	 * The invented `'singleton'` id is a minor contortion of its own (contortion
	 * 6), and it is what the subgraph model does too.
	 */
	{
		name: 'globalRate',
		id: 'id',
		fields: {
			lastUpdateTime: 'integer',
			totalRewardPerPointAtLastUpdate: {storage: 'blob', type: 'u256'},
			totalPoints: {storage: 'blob', type: 'u256'},
		},
	},

	/** `state.points.fixed[account]`. `toWithdraw` is a u256 (see `globalRate`). */
	{
		name: 'fixedRate',
		id: 'account',
		fields: {toWithdraw: {storage: 'blob', type: 'u256'}, lastTime: 'integer'},
	},

	/** `state.points.shared[account]`. Three u256s (see `globalRate`). */
	{
		name: 'sharedRate',
		id: 'account',
		fields: {
			points: {storage: 'blob', type: 'u256'},
			totalRewardPerPointAccounted: {storage: 'blob', type: 'u256'},
			rewardsToWithdraw: {storage: 'blob', type: 'u256'},
		},
	},

	/**
	 * `state.computedPoints[player]`, a DERIVED accumulator, and the counter the
	 * reorg case exists for.
	 *
	 * No contortion, and worth saying so: read-then-add-then-write needs no
	 * aggregation support, and two `addPoints` calls in one block compose purely
	 * from read-your-writes. Reverting the block that raised it must make it go
	 * back DOWN, which on this stream it really does: see the named revert case in
	 * `test/alpha1.test.ts`.
	 */
	{
		name: 'computedPoints',
		id: 'owner',
		fields: {points: 'integer'},
	},
]);

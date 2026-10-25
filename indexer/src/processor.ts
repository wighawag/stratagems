/**
 * The stratagems processor, as an `EntityProcessor` (`@etherfold/processor-entities`):
 * declared entities (`./entities.ts`), and `state.get` / `state.set` /
 * `state.delete` / `state.list` in one `on<Event>` handler per event.
 *
 * It replaces the JS-object processor (`fromJSProcessor`), whose authoring path is
 * gone from etherfold (its ADR-0037). The handlers are etherfold's stratagems
 * conformance workload port (`packages/conformance-workload-stratagems/src/processor.ts`),
 * a derived work of this repository's previous `indexer/src/index.ts`, and the
 * proof that they computed what the old one did over alpha1 is in
 * `../oracle/2026-09-29-alpha1/` at the tag `alpha1-final` (alpha1's support, and
 * the oracle with it, ended in step 10b, when the game moved onto the commit-reveal base).
 *
 * The one handler that is not a line-for-line port is `onMovesRevealed` (alpha1's
 * `onCommitmentRevealed`, whose moves the base's event no longer carries): the
 * old processor kept `state.placements` as an array it unshifted and popped past
 * 7. Here the window is `state.list('placement', {window}, 8)` (the only set read
 * a handler has, a bounded listing of an id prefix), keyed by the ARRIVAL of the
 * event that first saw a cycle, so the oldest arrival is the first row.
 */
import type {EntityProcessor, MutationContext} from '@etherfold/processor-entities';
import {
	arrivalOrdinal,
	CASCADE_PAGE,
	moveOrdinal,
	PLACEMENT_WINDOW,
	SINGLETON,
	stratagemsEntities,
	WINDOW,
} from './entities.js';
import {StratagemsContractOnEntities} from './stratagems-contract.js';
import type {StratagemsABI} from './abi.js';

/** What a listed placement carries: its arrival key, and the cycle it is for. */
type PlacementRow = {ordinal: string; cycle: number};
/** What a listed player carries: enough to delete it, and enough to project it. */
type PlacementPlayerRow = {ordinal: string; position: string; moveOrdinal: string};

/**
 * Drop one placement and everything nested under it.
 *
 * This is the original's `state.placements.pop()`, and it is the line that used
 * to need a hand-maintained CSV to know what to delete. Now the cascade follows
 * the DATA: the children of an arrival are a prefix listing under it, so there
 * is no second copy of the membership to keep in step.
 *
 * It pages rather than asking once with a big limit, and the paging is the
 * point: a listing that was `truncated` and got treated as the whole collection
 * is exactly how a cascade leaves orphans behind silently. Deleting a page is
 * visible to the next listing through read-your-writes, so the loop makes
 * progress within the block and stops when the prefix is empty.
 */
async function dropPlacement(state: MutationContext, ordinal: string): Promise<void> {
	for (;;) {
		const page = await state.list<PlacementPlayerRow>('placementPlayer', {window: WINDOW, ordinal}, CASCADE_PAGE);
		if (page.rows.length === 0) break;
		for (const player of page.rows) {
			state.delete('placementPlayer', {
				window: WINDOW,
				ordinal,
				position: player.position,
				moveOrdinal: player.moveOrdinal,
			});
		}
		if (!page.truncated) break;
	}
	state.delete('placement', {window: WINDOW, ordinal});
}

const ZERO_BYTES24 = '0x000000000000000000000000000000000000000000000000';

/** The base's identity is a `uint256`; stratagems' players are accounts, so it is an address. */
function playerToAccount(player: bigint): `0x${string}` {
	return `0x${player.toString(16).padStart(40, '0')}`;
}

/** The commitment after one chunk: the next head and what the bond still holds, or nothing after the last. */
async function advanceCommitment(
	state: MutationContext,
	account: `0x${string}`,
	furtherActions: `0x${string}`,
	taken: bigint,
): Promise<void> {
	if (furtherActions.toLowerCase() === ZERO_BYTES24) {
		state.delete('commitment', {account});
		return;
	}
	const row = (await state.get('commitment', {account})) as {cycle: number; bond: bigint | string} | undefined;
	if (!row) return;
	const bond = BigInt(row.bond);
	state.set('commitment', {account}, {cycle: Number(row.cycle), hash: furtherActions, bond: bond > taken ? bond - taken : 0n});
}

export const stratagemsProcessor: EntityProcessor<StratagemsABI> = {
	entities: stratagemsEntities,

	/**
	 * The moves of one revealed chunk. The base's `CommitmentRevealed` carries no
	 * actions (the base never sees them), so the game emits them in its own event,
	 * between the chunk's open and its close.
	 */
	async onMovesRevealed(state, event) {
		const cycle = Number(event.args.cycleNumber);
		const account = playerToAccount(event.args.player);

		// `state.placements.find(v => v.cycle === ...)`: the window is a DERIVED
		// collection, so finding a cycle in it is one bounded listing of the seven
		// it keeps -- no singleton remembering which cycles are in it, and no CSV.
		const window = await state.list<PlacementRow>('placement', {window: WINDOW}, PLACEMENT_WINDOW + 1);
		let ordinal = window.rows.find((row) => Number(row.cycle) === cycle)?.ordinal;
		if (ordinal === undefined) {
			// the original's `placements.unshift(...)`: appending is ONE row,
			// because the key is the arrival rather than a dense array position.
			ordinal = arrivalOrdinal(event);
			state.set('placement', {window: WINDOW, ordinal}, {cycle});
			if (window.rows.length >= PLACEMENT_WINDOW) {
				// ... and its `placements.pop()`: the oldest arrival is `rows[0]`,
				// because the ordering IS the key.
				await dropPlacement(state, window.rows[0].ordinal);
			}
		}

		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		for (let moveIndex = 0; moveIndex < event.args.moves.length; moveIndex++) {
			const move = event.args.moves[moveIndex];
			await stratagemsContract.computeMove(account, cycle, move);

			// `cell.players.push({color, address})`, as one write, keyed by the
			// move's own arrival, so it is naturally unique and ordered.
			state.set(
				'placementPlayer',
				{window: WINDOW, ordinal, position: move.position.toString(), moveOrdinal: moveOrdinal(event, moveIndex)},
				{color: move.color, address: account},
			);
		}
	},

	/** A chunk revealed: the commitment moves to the next chunk, or is spent with the last. */
	async onCommitmentRevealed(state, event) {
		await advanceCommitment(state, playerToAccount(event.args.player), event.args.furtherActions, event.args.cost);
	},

	async onSinglePoke(state, event) {
		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		await stratagemsContract.poke(event.args.position, Number(event.args.cycleNumber));
	},

	async onMultiPoke(state, event) {
		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		for (const position of event.args.positions) {
			await stratagemsContract.poke(position, Number(event.args.cycleNumber));
		}
	},

	onCommitmentCancelled(state, event) {
		state.delete('commitment', {account: playerToAccount(event.args.player)});
	},

	onCommitmentMade(state, event) {
		state.set(
			'commitment',
			{account: playerToAccount(event.args.player)},
			{cycle: Number(event.args.cycleNumber), hash: event.args.commitmentHash, bond: event.args.bond},
		);
	},

	/** A missed reveal settled: shown a chunk (and maybe more to come), or the whole commitment at once. */
	async onCommitmentVoid(state, event) {
		await advanceCommitment(state, playerToAccount(event.args.player), event.args.furtherActions, event.args.forfeited);
	},

	onReserveDeposited() {},
	onReserveWithdrawn() {},
	onCycleAdvanced() {},
	onWaitedForChanged() {},

	// --------------------------

	async onForceSimpleCells(state, event) {
		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		await stratagemsContract.forceSimpleCells(Number(event.args.cycle), event.args.cells as never);
	},

	// The three reward handlers are the flat case and port one-to-one, the u256
	// fields included: each is DECLARED a `u256` (ADR-0098), so the handler writes
	// the event's `bigint` as it is and every backend holds it canonically. 16,046
	// of the 31,332 real events are these three, so the canonical encoding is
	// load-bearing on this workload rather than a footnote.
	onAccounFixedRewardUpdated(state, event) {
		state.set(
			'fixedRate',
			{account: event.args.account},
			{
				toWithdraw: event.args.fixedRateStatus.toWithdraw,
				lastTime: Number(event.args.fixedRateStatus.lastTime),
			},
		);
	},

	onAccountSharedRewardUpdated(state, event) {
		state.set(
			'sharedRate',
			{account: event.args.account},
			{
				points: event.args.sharedRateStatus.points,
				totalRewardPerPointAccounted: event.args.sharedRateStatus.totalRewardPerPointAccounted,
				rewardsToWithdraw: event.args.sharedRateStatus.rewardsToWithdraw,
			},
		);
	},

	onGlobalRewardUpdated(state, event) {
		state.set('globalRate', SINGLETON, {
			lastUpdateTime: Number(event.args.globalStatus.lastUpdateTime),
			totalRewardPerPointAtLastUpdate: event.args.globalStatus.totalRewardPerPointAtLastUpdate,
			totalPoints: event.args.globalStatus.totalPoints,
		});
	},
};

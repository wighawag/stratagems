/**
 * The stratagems processor, as an `EntityProcessor` (`@etherfold/processor-entities`):
 * declared entities (`./entities.ts`), and `state.get` / `state.set` /
 * `state.delete` / `state.list` in one `on<Event>` handler per event.
 *
 * It replaces the JS-object processor (`fromJSProcessor`), whose authoring path is
 * gone from etherfold (its ADR-0037). The handlers are etherfold's stratagems
 * conformance workload port (`packages/conformance-workload-stratagems/src/processor.ts`),
 * a derived work of this repository's previous `indexer/src/index.ts`, and the
 * proof that they compute what the old one did over alpha1 is in
 * `../oracle/2026-09-29-alpha1/`.
 *
 * The one handler that is not a line-for-line port is `onCommitmentRevealed`: the
 * old processor kept `state.placements` as an array it unshifted and popped past
 * 7. Here the window is `state.list('placement', {window}, 8)` (the only set read
 * a handler has, a bounded listing of an id prefix), keyed by the ARRIVAL of the
 * event that first saw an epoch, so the oldest arrival is the first row.
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

/** What a listed placement carries: its arrival key, and the epoch it is for. */
type PlacementRow = {ordinal: string; epoch: number};
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

export const stratagemsProcessor: EntityProcessor<StratagemsABI> = {
	entities: stratagemsEntities,

	async onCommitmentRevealed(state, event) {
		const epoch = Number(event.args.epoch);
		const account = event.args.player.toLowerCase();

		// `state.placements.find(v => v.epoch === ...)`: the window is a DERIVED
		// collection, so finding an epoch in it is one bounded listing of the seven
		// it keeps -- no singleton remembering which epochs are in it, and no CSV.
		const window = await state.list<PlacementRow>('placement', {window: WINDOW}, PLACEMENT_WINDOW + 1);
		let ordinal = window.rows.find((row) => Number(row.epoch) === epoch)?.ordinal;
		if (ordinal === undefined) {
			// the original's `placements.unshift(...)`: appending is ONE row,
			// because the key is the arrival rather than a dense array position.
			ordinal = arrivalOrdinal(event);
			state.set('placement', {window: WINDOW, ordinal}, {epoch});
			if (window.rows.length >= PLACEMENT_WINDOW) {
				// ... and its `placements.pop()`: the oldest arrival is `rows[0]`,
				// because the ordering IS the key.
				await dropPlacement(state, window.rows[0].ordinal);
			}
		}

		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		for (let moveIndex = 0; moveIndex < event.args.moves.length; moveIndex++) {
			const move = event.args.moves[moveIndex];
			await stratagemsContract.computeMove(event.args.player, epoch, move);

			// `cell.players.push({color, address})`, as one write. The old port's
			// read-count / write-at-count / write-count-plus-one existed only because
			// the child's id ended in an array index; keyed by the move's own arrival
			// it is naturally unique, naturally ordered, and needs no count. The cell
			// itself is not a row at all: in the original a cell is created only in
			// order to push a player into it, so the set of cells is the set of
			// positions among the players, derived when read.
			state.set(
				'placementPlayer',
				{window: WINDOW, ordinal, position: move.position.toString(), moveOrdinal: moveOrdinal(event, moveIndex)},
				{color: move.color, address: account},
			);
		}

		state.delete('commitment', {account});
	},

	async onSinglePoke(state, event) {
		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		await stratagemsContract.poke(event.args.position, Number(event.args.epoch));
	},

	async onMultiPoke(state, event) {
		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		for (const position of event.args.positions) {
			await stratagemsContract.poke(position, Number(event.args.epoch));
		}
	},

	onCommitmentCancelled(state, event) {
		const account = event.args.player.toLowerCase();
		state.delete('commitment', {account});
	},

	onCommitmentMade(state, event) {
		const account = event.args.player.toLowerCase();
		state.set('commitment', {account}, {epoch: Number(event.args.epoch), hash: event.args.commitmentHash});
	},

	onCommitmentVoid(state, event) {
		const account = event.args.player.toLowerCase();
		state.delete('commitment', {account});
	},

	onReserveDeposited() {},
	onReserveWithdrawn() {},

	// --------------------------

	async onForceSimpleCells(state, event) {
		const stratagemsContract = new StratagemsContractOnEntities(state, 7);
		await stratagemsContract.forceSimpleCells(Number(event.args.epoch), event.args.cells as never);
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

/**
 * THE REFERENCE GAME'S INDEXER LOGIC: an etherfold `EntityProcessor` folding
 * its own events into the board the game draws. This file is the GAME's, as
 * every game's indexer logic is its own (`$lib/indexer` hosts it, see its
 * README); a descendant deletes `$lib/placement` with it.
 *
 * WHAT IT FOLDS, and why each is enough:
 *
 * - `Placed(player, cellID, stake)`: one per placement, `stake` being what the
 *   placement added to the player's stake on the cell. The rule
 *   (`_placementOutcome` in `UsingGameInternal.sol`) adds that to the cell's
 *   total and counts a new claimant when the player held no stake on it
 *   BEFORE, so the processor keeps each player's stake per cell (`claim`) to
 *   decide the same thing the same way. That is a copy of one line of the rule,
 *   kept because the event says what was added and not what the cell holds;
 *   the unit test holds the folded board to the contract's `getCellsInZones`.
 * - `CycleAdvanced(cycleNumber, commiting, ...)`: the cycle the last push left,
 *   which an offline world's board (Manual policy) is stamped with
 *   (`$lib/indexer/cycle-stamp`).
 *
 * Order does not matter, as the contract's rule does not let it: every write is
 * an accumulation, so a cycle's reveals folded in any order leave the same rows.
 */
import {
	declareEntities,
	type EntityProcessor,
} from '@etherfold/processor-entities';
import type deployments from '$lib/deployments';

/** The ABI the handlers are typed against: a TYPE only, so the worker carries no address. */
export type GameABI = (typeof deployments)['contracts']['Game']['abi'];

export const SINGLETON = {id: 'singleton'} as const;

export const placementEntities = declareEntities([
	/** A cell as the board holds it: `Cell` in `UsingGameTypes.sol`. */
	{
		name: 'cell',
		id: 'cellID',
		fields: {
			totalStake: {storage: 'blob', type: 'u256'},
			numClaimants: 'integer',
		},
	},
	/** One player's stake on one cell: what decides whether a placement is a new claim. */
	{
		name: 'claim',
		id: ['cellID', 'player'],
		fields: {stake: {storage: 'blob', type: 'u256'}},
	},
	/** The cycle the last `CycleAdvanced` left. */
	{
		name: 'advancedCycle',
		id: 'id',
		fields: {cycleNumber: 'integer', commiting: 'integer'},
	},
]);

export const placementProcessor: EntityProcessor<GameABI> = {
	entities: placementEntities,

	async onPlaced(state, event) {
		const cellID = event.args.cellID.toString();
		const player = event.args.player.toString();
		const added = event.args.stake;
		const claim = (await state.get('claim', {cellID, player})) as
			{stake: bigint | string} | undefined;
		const before = claim ? BigInt(claim.stake) : 0n;
		const cell = (await state.get('cell', {cellID})) as
			{totalStake: bigint | string; numClaimants: number} | undefined;
		state.set(
			'cell',
			{cellID},
			{
				totalStake: (cell ? BigInt(cell.totalStake) : 0n) + added,
				numClaimants: Number(cell?.numClaimants ?? 0) + (before === 0n ? 1 : 0),
			},
		);
		state.set('claim', {cellID, player}, {stake: before + added});
	},

	/** Only a push emits this, and under Manual only a push moves the cycle. */
	onCycleAdvanced(state, event) {
		state.set('advancedCycle', SINGLETON, {
			cycleNumber: Number(event.args.cycleNumber),
			commiting: event.args.commiting ? 1 : 0,
		});
	},
};

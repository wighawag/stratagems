/**
 * What the planned placements will do, from the contract's own rule.
 *
 * THE WORKED EXAMPLE of `$lib/game/simulation`: the contract exposes its rule
 * as `resolvePlacements` (the `Simulation` route, `contracts/src/game/routes/
 * GameSimulation.sol`), the client runs that route's deployed bytecode in the
 * sandbox, and the view draws the answer. Nothing here knows what a placement
 * does to a cell: that is the bytecode's to say, so a change to the rule in the
 * contract changes the preview with it, and there is no copy to drift.
 *
 * What IS here is the load: the rule is handed each planned cell as THIS
 * PLAYER sees it, which is the board's numbers plus what the player already
 * holds on the cell (whether they are a new claimant depends on it). The board
 * does not carry a per-player stake, so it is read once per cell and cycle with
 * `getStakeOnCell`, and kept until the board moves to another cycle.
 *
 * It is ONE PLAYER'S TURN, and that is all a preview can be: what the others
 * committed this cycle is a hash.
 */
import {derived, type Readable} from 'svelte/store';
import {latestResult, type LatestResult} from '$lib/game/simulation';
import type {OnchainStateValue} from '$lib/game/core/seams';
import type {Placement} from './commit-reveal';
import type {BoardState} from './state';
import type {LocalPlan} from './view';

/** A cell as one player's placement sees it: the route's `PlayerCell`. */
export type PlayerCell = {
	cellID: bigint;
	totalStake: bigint;
	numClaimants: number;
	playerStake: bigint;
};

/** What a planned cell will hold once the turn is revealed. */
export type CellPreview = {
	totalStake: bigint;
	numClaimants: number;
	/** What the player will hold on it, of `totalStake`. */
	playerStake: bigint;
};

export type PreviewInput = {
	player: bigint;
	cycleNumber: number;
	planned: readonly bigint[];
	/** The board's numbers for the planned cells, as they were when asked. */
	cells: readonly {cellID: bigint; totalStake: bigint; numClaimants: number}[];
};

export type PlacementPreviewStore = Readable<
	LatestResult<PreviewInput, ReadonlyMap<bigint, CellPreview>>
>;

export function createPlacementPreview(params: {
	plan: Readable<LocalPlan>;
	/** The board as the chain holds it (not the held copy the view draws). */
	board: Readable<OnchainStateValue<BoardState & {cycleNumber: number}>>;
	/**
	 * Who plays, as the contract keys them (`onchainIdentity`): a number on
	 * every branch, which keeps this file the same whatever an identity is.
	 */
	player: Readable<bigint | undefined>;
	/** The route, run from its bytecode: `resolvePlacements`. */
	simulate: (
		cells: readonly PlayerCell[],
		placements: readonly Placement[],
	) => Promise<readonly PlayerCell[]>;
	/** What `player` holds on `cellID`: `getStakeOnCell`. */
	stakeOf: (cellID: bigint, player: bigint) => Promise<bigint>;
}): PlacementPreviewStore {
	const {plan, board, player, simulate, stakeOf} = params;

	const inputs = derived(
		[plan, board, player],
		([$plan, $board, $player]): PreviewInput | undefined => {
			if ($player === undefined || $board.step !== 'Loaded') return undefined;
			if ($plan.planned.length === 0) return undefined;
			return {
				player: $player,
				cycleNumber: $board.cycleNumber,
				planned: $plan.planned,
				cells: $plan.planned.map((cellID) => {
					const cell = $board.cells.get(cellID);
					return {
						cellID,
						totalStake: cell?.totalStake ?? 0n,
						numClaimants: cell?.numClaimants ?? 0,
					};
				}),
			};
		},
	);

	// The player's own stake on a cell can only change by their own reveal,
	// which the board shows as a new cycle, so a read is good for the cycle.
	const stakes = new Map<string, Promise<bigint>>();
	let stakesCycle: number | undefined;
	function playerStake(cellID: bigint, player: bigint, cycleNumber: number) {
		if (stakesCycle !== cycleNumber) {
			stakes.clear();
			stakesCycle = cycleNumber;
		}
		const key = `${player}:${cellID}`;
		let stake = stakes.get(key);
		if (!stake) {
			stake = stakeOf(cellID, player);
			stakes.set(key, stake);
			// A failed read is not kept: the next plan change asks again.
			stake.catch(() => stakes.delete(key));
		}
		return stake;
	}

	return latestResult(
		inputs,
		async (input) => {
			const cells = await Promise.all(
				input.cells.map(async (cell): Promise<PlayerCell> => ({
					...cell,
					playerStake: await playerStake(
						cell.cellID,
						input.player,
						input.cycleNumber,
					),
				})),
			);
			const outcome = await simulate(
				cells,
				input.planned.map((cellID) => ({cellID})),
			);
			return new Map(
				outcome.map((cell) => [
					cell.cellID,
					{
						totalStake: cell.totalStake,
						numClaimants: Number(cell.numClaimants),
						playerStake: cell.playerStake,
					},
				]),
			);
		},
		{equal: sameInput},
	);
}

function sameInput(a: PreviewInput, b: PreviewInput): boolean {
	return (
		a.player === b.player &&
		a.cycleNumber === b.cycleNumber &&
		a.cells.length === b.cells.length &&
		a.cells.every((cell, i) => {
			const other = b.cells[i];
			return (
				cell.cellID === other.cellID &&
				cell.totalStake === other.totalStake &&
				cell.numClaimants === other.numClaimants
			);
		})
	);
}

/**
 * The plan with its preview, for the view merge: the preview is attached only
 * when it was computed for exactly the cells planned NOW, so a preview of the
 * plan as it was a click ago is never drawn over the plan as it is.
 */
export function withPreview(
	plan: Readable<LocalPlan>,
	preview: PlacementPreviewStore,
): Readable<LocalPlan> {
	return derived([plan, preview], ([$plan, $preview]): LocalPlan => {
		if ($preview.step !== 'Ready') return $plan;
		const planned = $preview.input.planned;
		const current =
			planned.length === $plan.planned.length &&
			planned.every((cellID, i) => cellID === $plan.planned[i]);
		return current ? {...$plan, preview: $preview.result} : $plan;
	});
}

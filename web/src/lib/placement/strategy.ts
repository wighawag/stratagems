/**
 * THE REFERENCE GAME'S STRATEGY: how a world seat at the `greedy` level picks
 * its placement, scored by the game's own rule run from its bytecode.
 *
 * WHAT IT IS FOR, said plainly because it would otherwise look like more than
 * it is. This game has no score: nothing ranks, nothing names a winner, a
 * placement adds the placement cost to a cell and to the player's stake on it.
 * So `greedy` needs an objective it defines itself, and the one here is the
 * player's SHARE of the stake on the cells it holds after the turn (the sum of
 * `playerStake / totalStake`). That objective makes greedy pick a cell nobody
 * holds, which `random` usually does too on a board this small. It exists to
 * exercise the seam (`$lib/game/core/strategy`), the stored turn and the
 * sandbox end to end in the game every node carries; the comparison that
 * matters is the one a game with a real score makes (stratagems' net gems).
 *
 * THE RULE IS THE CONTRACT'S, never a copy (the plan's PA4). The candidates are
 * the cells a played turn may land on, read from the chain; they are handed to
 * `resolvePlacements` (the `Simulation` route, `contracts/src/game/routes/
 * GameSimulation.sol`) as the player sees them, with ONE placement on each, in
 * ONE call. That is exact rather than an approximation because the rule reads
 * only the placed cell: the outcome for each candidate is the outcome of a
 * one-placement turn on it. A game whose rule reads neighbours cannot batch
 * this way and simulates each candidate turn on its own.
 *
 * ONE CELL PER DISTINCT STATE, not every candidate, and that is measured: the
 * route finds each placement's cell by a scan, so 169 cells and 169 placements
 * are some fourteen thousand iterations of interpreted EVM, 178 ms of a 195 ms
 * decision in node on a board of 32 claimed cells. The rule reads a cell's
 * numbers and never its id, so cells with the same numbers have the same
 * outcome (every empty cell, above all), and simulating one of each is the same
 * answer for a fraction of the work.
 *
 * ONE PLACEMENT, as `random` plays, so both levels spend their reserve at the
 * same pace and a comparison between them is about where, not how much. Ties
 * (every empty cell scores the same) are broken by the seat's seeded random, so
 * two greedy seats rarely pick the same empty cell and a test reproduces.
 *
 * WHERE A PLACEMENT IS FREE (`with/nft-identity`, whose stake is custody of
 * a token) no stake ever moves, every share is zero and every candidate ties,
 * so greedy plays a seeded-random cell of the block there. That is the honest
 * consequence of an objective about stake on a branch without one, and it
 * still exercises the seam.
 *
 * WHAT IT SEES (PA6): the board on chain and the simulation. It is handed a
 * public client on the world's provider and the sandbox, and nothing else.
 */
import type {Abi, PublicClient} from 'viem';
import type {AiLevel, Strategy} from '$lib/game/core/strategy';
import type {BytecodeSandbox} from '$lib/game/simulation';
import {positionOf, zonesInRect} from './cells';
import type {Placement} from './commit-reveal';
import type {PlayerCell} from './preview';

/** The levels this game's world seats may play at. `random` is today's. */
export const PLACEMENT_LEVELS: readonly AiLevel[] = [
	{id: 'random', label: 'Random'},
	{id: 'greedy', label: 'Greedy'},
];

/** A share as a fixed-point number, exact enough to compare and to tie. */
const SHARE_SCALE = 10n ** 18n;

/** What the player holds of a cell's stake, scaled by {@link SHARE_SCALE}. */
export function shareOf(cell: {
	totalStake: bigint;
	playerStake: bigint;
}): bigint {
	if (cell.totalStake === 0n) return 0n;
	return (cell.playerStake * SHARE_SCALE) / cell.totalStake;
}

type CellAt = {cellID: bigint; totalStake: bigint; numClaimants: number};

export function createPlacementStrategy(params: {
	/** A client on the world's provider, for the board. */
	publicClient: Pick<PublicClient, 'readContract'>;
	/** The game's rule, run from the `Simulation` route's bytecode. */
	sandbox: BytecodeSandbox<'rules'>;
	contract: {address: `0x${string}`; abi: Abi};
	/** Where a played turn may land: the cells the strategy chooses among. */
	candidates: readonly bigint[];
	/**
	 * Called once per decision with how long it took and how many cells it
	 * read, for a caller that measures (the world test does).
	 */
	onDecided?: (measure: {
		ms: number;
		claimed: number;
		simulated: number;
	}) => void;
}): Strategy<Placement> {
	const {publicClient, sandbox, contract, candidates} = params;

	const bounds = candidates.reduce(
		(rect, cellID) => {
			const {x, y} = positionOf(cellID);
			return {
				left: Math.min(rect.left, x),
				top: Math.min(rect.top, y),
				right: Math.max(rect.right, x),
				bottom: Math.max(rect.bottom, y),
			};
		},
		{left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity},
	);
	const zones = candidates.length > 0 ? zonesInRect(bounds) : [];

	async function read<T>(functionName: string, args: unknown[]): Promise<T> {
		// The same cast the app's readers make at this boundary: a helper that
		// takes a function NAME cannot have viem infer the arguments.
		return (await publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName,
			args,
		} as never)) as T;
	}

	return async ({identity, random, budget}) => {
		if (budget.actionsAtMost < 1 || candidates.length === 0) return [];
		const started = Date.now();

		const [claimed] = await read<[readonly CellAt[], bigint]>(
			'getCellsInZones',
			[zones],
		);
		const board = new Map(claimed.map((cell) => [BigInt(cell.cellID), cell]));

		// THE CELL AS THIS PLAYER SEES IT, which is what the rule is handed: the
		// board's numbers and what the player already holds there (whether they
		// are a new claimant depends on it). Only a claimed cell can hold any.
		const before: PlayerCell[] = await Promise.all(
			candidates.map(async (cellID): Promise<PlayerCell> => {
				const cell = board.get(cellID);
				const totalStake = cell ? BigInt(cell.totalStake) : 0n;
				return {
					cellID,
					totalStake,
					numClaimants: cell ? Number(cell.numClaimants) : 0,
					playerStake:
						totalStake > 0n
							? await read<bigint>('getStakeOnCell', [cellID, identity])
							: 0n,
				};
			}),
		);

		// One representative per distinct state, in the order first met.
		const stateOf = (cell: PlayerCell) =>
			`${cell.totalStake}:${cell.numClaimants}:${cell.playerStake}`;
		const classes = new Map<string, PlayerCell>();
		for (const cell of before) {
			if (!classes.has(stateOf(cell))) classes.set(stateOf(cell), cell);
		}
		const representatives = [...classes.values()];

		const after = (await sandbox.call({
			contract: 'rules',
			abi: contract.abi,
			functionName: 'resolvePlacements' as never,
			args: [
				representatives,
				representatives.map(({cellID}) => ({cellID})),
			] as never,
		})) as unknown as readonly PlayerCell[];
		const gainOf = new Map(
			representatives.map((cell, i) => [
				stateOf(cell),
				shareOf(after[i]) - shareOf(cell),
			]),
		);

		// The objective is a SUM over the cells held, and one placement changes
		// one cell, so the gain of a candidate is that cell's change alone.
		let best: bigint | undefined;
		let bestCells: bigint[] = [];
		for (const cell of before) {
			const gain = gainOf.get(stateOf(cell))!;
			if (best === undefined || gain > best) {
				best = gain;
				bestCells = [cell.cellID];
			} else if (gain === best) {
				bestCells.push(cell.cellID);
			}
		}
		const chosen = bestCells[random.below(bestCells.length)];

		params.onDecided?.({
			ms: Date.now() - started,
			claimed: claimed.length,
			simulated: representatives.length,
		});
		return [{cellID: chosen}];
	};
}

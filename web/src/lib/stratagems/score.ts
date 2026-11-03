/**
 * A TABLE'S SCORE (step L4 of work/plans/join-template-commit-reveal.md,
 * L4-13 and L4-18): net gems, what the game gave a member less what it took.
 *
 * ON CHAIN, ONCE SETTLED, IT IS EXACT: every payout and every survivor's stake
 * has been credited to the reserve (`StratagemsTable.settle`), so a member's
 * score is their reserve, less the stake they sat down with, plus what
 * collisions cost them (L4-16). That is what `getScores` records.
 *
 * BEFORE THEN THE BOARD STILL HOLDS GEMS, and the live ranking values each cell
 * as the end would ({@link valueAtEnd}): the table's own `StratagemsSimulation`
 * pokes every coloured cell `MAX_LIFE` cycles on, run from its bytecode in the
 * sandbox, which is exactly what the settlement does on chain. So the live
 * number is the final one the moment the table ends, and no rule is copied
 * here (X2 ended that).
 *
 * The same `valueAtEnd` is what step A2's greedy scores a candidate turn with.
 */
import {zeroAddress} from 'viem';
import type {ContractCell} from 'stratagems-common';
import type {BoardState} from './board/indexed-board';
import {storedCellsOf, touchedBy, type StoredCell} from './preview';

/** `EVIL_OWNER`: a collision's cell. Gems sent there are gone; it is nobody's score. */
export const EVIL_OWNER = '0xffffffffffffffffffffffffffffffffffffffff';

/** What `StratagemsSimulation.poke` answers: the cells after, and who is paid what. */
export type PokeOutcome = {
	cells: readonly StoredCell[];
	payouts: readonly {to: `0x${string}`; amount: bigint}[];
};

/** `StratagemsSimulation.poke`, run from its bytecode. */
export type SimulatePoke = (
	board: readonly StoredCell[],
	cycleNumber: number,
	positions: readonly bigint[],
) => Promise<PokeOutcome>;

/** The cells a settlement still has to settle: a colour and a stake. */
export function unsettledPositions(data: BoardState['data']): bigint[] {
	const positions: bigint[] = [];
	for (const [key, cell] of Object.entries(data.cells) as [
		string,
		ContractCell,
	][]) {
		if (cell.color !== 0 && cell.stake !== 0) positions.push(BigInt(key));
	}
	return positions.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * WHAT EVERY ACCOUNT WOULD RECEIVE IF THE BOARD WERE SETTLED `maxLife` CYCLES
 * after `cycleNumber`, with nobody moving: the shares the dead pay their
 * killers, and every survivor's stake to its owner, in token units, keyed by
 * lowercase address (Evil's included, which is nobody's score).
 */
export async function valueAtEnd(params: {
	data: BoardState['data'];
	cycleNumber: number;
	maxLife: number;
	numTokensPerGems: bigint;
	simulate: SimulatePoke;
}): Promise<Map<string, bigint>> {
	const value = new Map<string, bigint>();
	const positions = unsettledPositions(params.data);
	if (positions.length === 0) return value;
	const add = (to: string, amount: bigint) => {
		const key = to.toLowerCase();
		value.set(key, (value.get(key) ?? 0n) + amount);
	};
	const board = storedCellsOf(params.data, touchedBy(positions));
	const outcome = await params.simulate(
		board,
		params.cycleNumber + params.maxLife,
		positions,
	);
	for (const payout of outcome.payouts) add(payout.to, payout.amount);
	const settled = new Set(positions.map((p) => p.toString()));
	for (const stored of outcome.cells) {
		if (!settled.has(stored.position.toString())) continue;
		if (stored.cell.color === 0 || stored.cell.life === 0) continue;
		if (stored.owner === zeroAddress) continue;
		add(stored.owner, BigInt(stored.cell.stake) * params.numTokensPerGems);
	}
	return value;
}

/** A member's net gems, from the reserve as it stands and the board's value at the end. */
export function netGemsOf(params: {
	reserve: bigint;
	stake: bigint;
	collisionCredit: bigint;
	valueAtEnd: bigint;
}): bigint {
	return (
		params.reserve - params.stake + params.collisionCredit + params.valueAtEnd
	);
}

/** A row of a table's ranking. */
export type TableScoreRow = {
	player: `0x${string}`;
	/** Net gems, in token units: final once the table is settled. */
	score: bigint;
	/** Whether this is one of the winners: only once settled. */
	winner: boolean;
};

/** The members ranked by score, best first, ties by address. Pure. */
export function rankScores(
	rows: readonly {player: `0x${string}`; score: bigint}[],
	winners: readonly string[] = [],
): TableScoreRow[] {
	const won = new Set(winners.map((w) => w.toLowerCase()));
	return [...rows]
		.map((row) => ({
			player: row.player.toLowerCase() as `0x${string}`,
			score: row.score,
			winner: won.has(row.player.toLowerCase()),
		}))
		.sort((a, b) =>
			a.score !== b.score
				? a.score > b.score
					? -1
					: 1
				: a.player < b.player
					? -1
					: a.player > b.player
						? 1
						: 0,
		);
}

/** The positions to settle, in batches a transaction carries. */
export function settleBatches(
	positions: readonly bigint[],
	batch: number,
): bigint[][] {
	const batches: bigint[][] = [];
	for (let i = 0; i < positions.length; i += batch) {
		batches.push(positions.slice(i, i + batch));
	}
	return batches;
}

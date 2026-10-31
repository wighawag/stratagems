/**
 * THE PROJECTION: a stored cell brought to a cycle, the one rule of the
 * contract the client still runs in TypeScript.
 *
 * Every read of the game brings a cell to the cycle it is read at
 * (`_getUpdatedCell` in `contracts/src/game/internal/UsingStratagemsState.sol`,
 * with `_computeNewLife` and `_effectiveDelta`): its life moves by one a cycle,
 * up or down, from the cycle it was last written at. The board, the planner,
 * the leaderboard and the winnings do this for every cell on every update,
 * which is too often to run in bytecode (measured in step X's specification:
 * 1.1 s for 10,000 cells on webevm's default engine), so it stays here, and
 * `web/test/lib/stratagems/projection.test.ts` holds it to the contract's own
 * code (`StratagemsSimulation.cellAtCycle`, run in the bytecode sandbox) over
 * every life, both signs of delta, an empty and a full enemy map, and cycle
 * gaps of 0 to 10.
 *
 * Everything else the rules do (what a move does to a cell and its neighbours,
 * the payouts, the points) is the contract's alone: the client previews a turn
 * by running `StratagemsSimulation`'s bytecode, and the indexer folds the cells
 * the contract wrote (`CellsWritten`). Until step X2 of
 * work/plans/join-template-commit-reveal.md this package held a 700-line copy
 * of all of it (`StratagemsContract`), and the indexer a second.
 *
 * Written line for line from the Solidity, unsigned arithmetic included: the
 * effective delta is always 1 or -1, so a division by it is exact.
 */
import {Color, type ContractCell} from './types';

/** A cell nobody ever wrote: what the contract reads at an empty position. */
export function emptyCell(): ContractCell {
	return {
		lastCycleUpdate: 0,
		cycleWhenTokenIsAdded: 0,
		producingCycles: 0,
		color: Color.None,
		life: 0,
		delta: 0,
		enemyMap: 0,
		distribution: 0,
		stake: 0,
	};
}

/** `_effectiveDelta`: 1 with more friends than enemies, or with no enemy at all; otherwise -1. */
export function effectiveDelta(delta: number, enemyMap: number): number {
	let effective = delta > 0 ? 1 : -1;
	if (effective < 0 && enemyMap == 0) {
		effective = 1;
	}
	return effective;
}

/** `_computeNewLife`: the life at `cycle` of a cell last written at `lastUpdate`, and the cycle that life is as of. */
export function computeNewLife(
	maxLife: number,
	lastUpdate: number,
	enemyMap: number,
	delta: number,
	life: number,
	cycle: number,
): {newLife: number; cycleUsed: number} {
	let newLife = 0;
	let cycleUsed = lastUpdate;
	if (lastUpdate >= 1 && life > 0) {
		let cycleDelta = cycle - lastUpdate;
		if (cycleDelta > 0) {
			const effective = effectiveDelta(delta, enemyMap);
			if (effective > 0) {
				const maxCycle = Math.floor((maxLife - life + effective - 1) / effective);
				if (cycleDelta > maxCycle) {
					cycleDelta = maxCycle;
				}
				life += cycleDelta * effective;
				if (life > maxLife) {
					life = maxLife;
				}
				newLife = life;
				cycleUsed = cycle;
			} else {
				const numCycleBeforeDying = Math.floor((life - effective - 1) / -effective);
				if (cycleDelta > numCycleBeforeDying) {
					cycleDelta = numCycleBeforeDying;
				}
				const lifeLoss = cycleDelta * -effective;
				newLife = lifeLoss > life ? 0 : life - lifeLoss;
				cycleUsed = lastUpdate + cycleDelta;
			}
		} else {
			newLife = life;
			cycleUsed = lastUpdate;
		}
	}
	return {newLife, cycleUsed};
}

/**
 * `_getUpdatedCell`: the stored `cell` brought to `cycle`, and whether it
 * reached zero life on the way. `cell` is not changed; an absent cell reads as
 * the empty one.
 */
export function cellAtCycle(
	cell: ContractCell | undefined,
	cycle: number,
	maxLife: number,
): {cell: ContractCell; justDied: boolean} {
	const updated = {...emptyCell(), ...cell};
	const lastUpdate = updated.lastCycleUpdate;
	if (lastUpdate >= 1 && updated.life > 0) {
		const {newLife} = computeNewLife(maxLife, lastUpdate, updated.enemyMap, updated.delta, updated.life, cycle);
		updated.life = newLife;
		updated.lastCycleUpdate = cycle;
		if (effectiveDelta(updated.delta, updated.enemyMap) > 0) {
			updated.producingCycles += cycle - lastUpdate;
		}
		return {cell: updated, justDied: newLife == 0};
	}
	return {cell: updated, justDied: false};
}

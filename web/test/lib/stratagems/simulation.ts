/**
 * `StratagemsSimulation` for the unit tests: the contract's own code, from the
 * contracts' build, run in the bytecode sandbox on a webevm node in this
 * thread, deployed with a local game's config (`maxLife` 7, a gem of 10^18).
 *
 * The rules a test's board is played with, and the oracle the projection is
 * held to (`./projection.test.ts`): no copy of the rules in TypeScript.
 */
import {createNode} from 'webevm';
import {zeroAddress} from 'viem';
import {Artifact_StratagemsSimulation as Simulation} from 'stratagems-contracts/artifacts/StratagemsSimulation.js';
import type {ContractCell} from 'stratagems-common';
import {createBytecodeSandbox} from '$lib/game/simulation';
import type {Move} from '$lib/stratagems/moves';
import type {StoredCell} from '$lib/stratagems/preview';

export const SIMULATION_MAX_LIFE = 7;

const CONFIG = {
	tokens: zeroAddress,
	burnAddress: zeroAddress,
	startTime: 0n,
	commitPhaseDuration: 30n,
	revealPhaseDuration: 10n,
	maxLife: SIMULATION_MAX_LIFE,
	numTokensPerGems: 10n ** 18n,
	time: zeroAddress,
	generator: zeroAddress,
	actionsPerReveal: 32n,
	cyclePolicy: 0,
} as const;

let sandbox: ReturnType<typeof create> | undefined;

function create() {
	return createBytecodeSandbox({
		contracts: {
			simulation: {
				creationCode: Simulation.bytecode as `0x${string}`,
				abi: Simulation.abi,
				args: [CONFIG],
			},
		},
		node: () => createNode({}),
	});
}

/** One sandbox for the whole test file: the node and the deployment are made once. */
function simulation() {
	return (sandbox ??= create());
}

/** `resolveMoves`: the touched cells after `player`'s moves in `cycle`. */
export async function resolveMoves(
	board: readonly StoredCell[],
	player: `0x${string}`,
	cycle: number,
	moves: readonly Move[],
): Promise<readonly StoredCell[]> {
	const outcome = await simulation().call({
		contract: 'simulation',
		abi: Simulation.abi,
		functionName: 'resolveMoves',
		args: [[...board], player, cycle, [...moves]],
	});
	return outcome.cells;
}

/** `cellAtCycle`: the stored `cell` brought to `cycle`, by the contract. */
export async function contractCellAtCycle(
	cell: ContractCell,
	cycle: number,
): Promise<{cell: ContractCell; justDied: boolean}> {
	const [projected, justDied] = await simulation().call({
		contract: 'simulation',
		abi: Simulation.abi,
		functionName: 'cellAtCycle',
		args: [cell, cycle],
	});
	return {cell: {...projected}, justDied};
}

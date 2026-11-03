/**
 * A2-8's GATE, IN THE BROWSER (step A2 of work/plans/join-template-commit-reveal.md):
 * a greedy decision on a board of 30 moves, its moves simulated by
 * `StratagemsSimulation` in a Worker, as the offline world's seats run it
 * (`$lib/game/simulation`'s default node in a browser). The board is played by
 * the contract's own code (`./board.ts`).
 */
import {describe, expect, it} from 'vitest';
import {zeroAddress} from 'viem';
import {Color} from 'stratagems-common';
import {Artifact_StratagemsSimulation as Simulation} from 'stratagems-contracts/artifacts/StratagemsSimulation.js';
import {seededRandom} from '$lib/game/core/strategy';
import {createBytecodeSandbox} from '$lib/game/simulation';
import type {StoredCell} from '$lib/stratagems/preview';
import {
	createStratagemsStrategy,
	GREEDY_CANDIDATES,
	type DecisionMeasure,
	type StratagemsSimulator,
} from '$lib/stratagems/strategy';
import {
	ALICE,
	BOB,
	boardAfter,
	CAROL,
	GEM,
	MAX_LIFE,
	type Played,
} from './board';
import {SIMULATION_CONFIG} from './simulation';

const NO_START = {owner: zeroAddress, cycle: 0, life: 0} as const;
const EMPTY = {
	lastCycleUpdate: 0,
	cycleWhenTokenIsAdded: 0,
	producingCycles: 0,
	color: 0,
	life: 0,
	delta: 0,
	enemyMap: 0,
	distribution: 0,
	stake: 0,
};

describe('a greedy decision in the browser (A2-8)', () => {
	it('takes at most 500 ms, median, on a board of 30 moves', async () => {
		let s = 7;
		const next = () => (
			(s = (s * 1103515245 + 12345) % 2147483648),
			s / 2147483648
		);
		const players = [
			[ALICE, Color.Blue],
			[BOB, Color.Red],
			[CAROL, Color.Green],
		] as const;
		const used = new Set<string>();
		const history: {cycle: number; moves: Played[]}[] = [];
		for (let c = 0; c < 10; c++) {
			const moves: Played[] = [];
			for (const [player, color] of players) {
				let x: number, y: number;
				do {
					x = Math.floor(next() * 13) - 6;
					y = Math.floor(next() * 13) - 6;
				} while (used.has(`${x},${y}`));
				used.add(`${x},${y}`);
				moves.push({player, x, y, color});
			}
			history.push({cycle: 10 + c, moves});
		}
		const played = await boardAfter(history, 20);
		const board = new Map<string, StoredCell>();
		for (const [key, cell] of Object.entries(played.data.cells)) {
			board.set(key, {
				position: BigInt(key),
				owner: (played.data.owners[key] ?? zeroAddress) as `0x${string}`,
				cell: {...cell},
				start: NO_START,
			});
		}

		// THE WORLD'S WAY: a sandbox whose node is a Worker
		const sandbox = createBytecodeSandbox({
			contracts: {
				simulation: {
					creationCode: Simulation.bytecode as `0x${string}`,
					abi: Simulation.abi,
					args: [SIMULATION_CONFIG],
				},
			},
		});
		const call = (functionName: 'resolveMoves' | 'poke', args: unknown[]) =>
			sandbox.call({
				contract: 'simulation',
				abi: Simulation.abi,
				functionName: functionName as never,
				args: args as never,
			}) as never;
		const simulator: StratagemsSimulator = {
			resolveMoves: (b, player, cycle, moves) =>
				call('resolveMoves', [[...b], player, cycle, [...moves]]),
			poke: (b, cycle, positions) =>
				call('poke', [[...b], cycle, [...positions]]),
		};
		const measures: DecisionMeasure[] = [];
		const strategy = createStratagemsStrategy({
			readBoard: async (positions) =>
				positions.map(
					(position) =>
						board.get(position.toString()) ?? {
							position,
							owner: zeroAddress,
							cell: EMPTY,
							start: NO_START,
						},
				),
			simulator,
			config: {maxLife: MAX_LIFE, numTokensPerGems: GEM},
			colorOf: () => Color.Blue,
			onDecided: (m) => measures.push(m),
		});
		try {
			// the first call starts the Worker and deploys: not a decision's cost
			await simulator.poke([], 1, []);
			for (let i = 0; i < 5; i++) {
				await strategy({
					identity: BigInt(ALICE),
					cycleNumber: 20,
					level: 'greedy',
					random: seededRandom({
						chainId: 31337,
						contract: zeroAddress,
						identity: BigInt(i),
						cycleNumber: 20,
					}),
					budget: {actionsAtMost: 1},
				});
			}
		} finally {
			sandbox.dispose();
		}
		const ms = measures.map((m) => m.ms).sort((a, b) => a - b);
		console.log(
			`greedy in the browser on 30 moves, ${GREEDY_CANDIDATES} candidates: ${ms.join(', ')} ms`,
		);
		expect(measures.every((m) => m.candidates === GREEDY_CANDIDATES)).toBe(
			true,
		);
		expect(ms[2]).toBeLessThanOrEqual(500);
	}, 120_000);
});

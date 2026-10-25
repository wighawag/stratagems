import {describe, it, expect} from 'vitest';
import {bondFor, resolvePlacementConfig} from '$lib/placement/config';
import type {TypedDeployments} from '$lib/core/connection/types';

/**
 * THE CHUNK SIZE COMES OFF THE DEPLOYMENT, and this is what says so.
 *
 * A turn longer than one transaction is committed as a hash chain, and the head
 * of that chain depends on how the turn was cut up. So a client that carried its
 * own number - a constant, a default, a fallback - would commit a head the
 * contract cannot follow the moment the deployment said anything else, and the
 * only symptom would be a reveal reverting after the bond was already immovable.
 *
 * The other half of this pair is in `contracts/test/js/Game.test.ts`, which
 * deploys a game at a different chunk size and watches the contract's rule
 * follow; together they are what stops the two sides drifting.
 */
function deploymentsDeclaring(game: Record<string, unknown>): TypedDeployments {
	return {
		chain: {properties: {expectedWorstGasPrice: '1000000000'}},
		contracts: {
			Game: {
				address: '0x0000000000000000000000000000000000000001',
				linkedData: {
					startTime: '0',
					commitPhaseDuration: '30',
					revealPhaseDuration: '10',
					cyclePolicy: '0',
					placementCost: '1000000000000000000',
					tokens: '0x0000000000000000000000000000000000000002',
					// Declared by the deploy because they are measured against ITS
					// contracts. See the gas budget block below.
					commitGas: '150000',
					revealGas: '600000',
					expectedActionsPerTurn: '4',
					...game,
				},
			},
			StakeSale: {
				address: '0x0000000000000000000000000000000000000003',
				linkedData: {price: '10', amount: '10000000000000000000'},
			},
		},
	} as unknown as TypedDeployments;
}

describe('the gas budget the client sizes a stipend from', () => {
	/**
	 * WHOSE NUMBERS THEY ARE IS THE POINT. These used to be constants in
	 * `$lib/placement/config`, which is inherited down the template tree while
	 * contracts are not, so a descendant budgeted with gas measured against a
	 * game it does not run - in a file whose text did not differ at all. They are
	 * declared by the deploy now, and `contracts/test/js/GasBudget.test.ts` is
	 * the other half of this pair: it fails when the contracts outgrow what the
	 * deployment claims, and this fails when the client stops reading it.
	 */
	it('is whatever the deployment declared', () => {
		const config = resolvePlacementConfig(
			deploymentsDeclaring({
				actionsPerReveal: '4',
				commitGas: '99102',
				revealGas: '374085',
			}),
		);
		// The identity branches' real figures, which differ from `main`'s by about
		// 30% for the same two transactions.
		expect(config.gas.commit).toBe(99_102n);
		expect(config.gas.reveal).toBe(374_085n);
	});

	it('sizes the stipend from them rather than from a constant', () => {
		const cheap = resolvePlacementConfig(
			deploymentsDeclaring({
				actionsPerReveal: '4',
				commitGas: '100000',
				revealGas: '400000',
			}),
		);
		const dear = resolvePlacementConfig(
			deploymentsDeclaring({
				actionsPerReveal: '4',
				commitGas: '200000',
				revealGas: '800000',
			}),
		);
		// A game whose transactions cost twice as much hands its players twice the
		// gas for the same number of steps. That is the whole reason the figure
		// has to come from the deployment.
		expect(dear.sale.stipend).toBe(cheap.sale.stipend * 2n);
	});

	it('sizes the stipend in TURNS, which costs more where a turn is longer', () => {
		// THE PARAMETER EARNS ITS KEEP ON THE BRANCH WHERE A PLACEMENT IS FREE.
		// A turn of four is one chunk, so one commit and one reveal; a turn of
		// twelve is three chunks, so one commit and three reveals. The stipend
		// has to follow, and before this parameter existed there was nothing for
		// it to follow: `revealGas` bounds a transaction and nothing bounds a
		// turn.
		const short = resolvePlacementConfig(
			deploymentsDeclaring({
				actionsPerReveal: '4',
				expectedActionsPerTurn: '4',
			}),
		);
		const long = resolvePlacementConfig(
			deploymentsDeclaring({
				actionsPerReveal: '4',
				expectedActionsPerTurn: '12',
			}),
		);

		// (150,000 + 600,000) against (150,000 + 3 x 600,000).
		expect(long.sale.stipend).toBe(
			(short.sale.stipend * 1_950_000n) / 750_000n,
		);
		expect(long.expectedActionsPerTurn).toBe(12);
	});

	it('charges a whole extra transaction for one action past a chunk', () => {
		// `ceil`, because that is the cost the chunk actually imposes.
		const exact = resolvePlacementConfig(
			deploymentsDeclaring({
				actionsPerReveal: '4',
				expectedActionsPerTurn: '4',
			}),
		);
		const oneMore = resolvePlacementConfig(
			deploymentsDeclaring({
				actionsPerReveal: '4',
				expectedActionsPerTurn: '5',
			}),
		);
		expect(oneMore.sale.stipend).toBeGreaterThan(exact.sale.stipend);
	});

	it('refuses a deployment that does not say what a turn is', () => {
		// It cannot be measured and it cannot be derived: it is the game's claim
		// about its own players. A guess here funds a signer for a game nobody is
		// playing.
		expect(() =>
			resolvePlacementConfig(
				deploymentsDeclaring({
					actionsPerReveal: '4',
					expectedActionsPerTurn: undefined,
				}),
			),
		).toThrow(/expectedActionsPerTurn/);
	});

	it('refuses a deployment that declares no gas, rather than guessing', () => {
		// Same argument as `actionsPerReveal` below: there is no safe default for
		// a number measured against contracts this build cannot see, and a guessed
		// stipend is a signer funded for a game it is not playing.
		expect(() =>
			resolvePlacementConfig(
				deploymentsDeclaring({actionsPerReveal: '4', commitGas: undefined}),
			),
		).toThrow(/commitGas/);
		expect(() =>
			resolvePlacementConfig(
				deploymentsDeclaring({actionsPerReveal: '4', revealGas: undefined}),
			),
		).toThrow(/revealGas/);
	});
});

describe('the chunk size the client cuts a turn to', () => {
	it('is whatever the deployment declared', () => {
		expect(
			resolvePlacementConfig(deploymentsDeclaring({actionsPerReveal: '4'}))
				.actionsPerReveal,
		).toBe(4);

		// Changed in the deploy script, followed here, with nothing in between to
		// keep in step.
		expect(
			resolvePlacementConfig(deploymentsDeclaring({actionsPerReveal: '7'}))
				.actionsPerReveal,
		).toBe(7);
	});

	it('refuses a deployment that does not declare one, rather than guessing', () => {
		// THERE IS NO SAFE DEFAULT. A client that substituted one would hash a
		// chain the contract cannot follow and would do it confidently; saying so
		// at startup costs nothing, and saying it a cycle later costs a bond.
		expect(() => resolvePlacementConfig(deploymentsDeclaring({}))).toThrow(
			/actionsPerReveal/,
		);
	});
});

/**
 * THE BOND IS PUBLIC, so the client rounds it up to whole chunks: a bond equal
 * to the cost would tell everyone how many placements the commitment hides.
 */
describe('the bond the client posts', () => {
	const config = {placementCost: 10n, actionsPerReveal: 4} as never;

	it('is a whole number of chunks, so it does not say how many placements', () => {
		expect(bondFor(config, 1)).toBe(40n);
		expect(bondFor(config, 4)).toBe(40n);
		expect(bondFor(config, 5)).toBe(80n);
	});

	it('is nothing for an empty turn', () => {
		expect(bondFor(config, 0)).toBe(0n);
	});

	it('is capped at the reserve, and never below the cost', () => {
		// Covers the cost and not the rounding: all of the reserve.
		expect(bondFor(config, 5, 70n)).toBe(70n);
		// Cannot cover the cost: the cost, which the contract will refuse anyway
		// with numbers about the turn rather than about the rounding.
		expect(bondFor(config, 5, 30n)).toBe(50n);
		// Covers the rounding: the rounding.
		expect(bondFor(config, 5, 1000n)).toBe(80n);
	});
});

import {expect} from 'earl';
import {describe, it} from 'node:test'; // using node:test as hardhat v3 do not support vitest
import {network} from 'hardhat';
import {
	setupFixtures,
	enterGame,
	commitmentHashFor,
	revealTurn,
	TURN_BOND,
	type Placement,
} from './utils/index.js';
import {zeroAddress} from 'viem';

/**
 * THE SIMULATION ROUTE IS THE REVEAL'S RULE, and the reveal is its oracle.
 *
 * A client previews a turn by running `resolvePlacements` from the deployed
 * bytecode in its own sandbox (`web/src/lib/game/simulation/`), handing it the
 * cells as it read them. That preview is only worth anything if it is what the
 * reveal then does, so these tests preview a turn from what the chain holds,
 * reveal it, and compare the board with the preview, cell by cell, on the
 * shapes where the rule branches: a cell nobody holds, one this player already
 * holds, one somebody else holds, and one the turn names twice.
 *
 * WRITTEN AGAINST WHATEVER THE DEPLOYMENT CHARGES, and against however a
 * player gets in (`enterGame`, `TURN_BOND`), because those are what a branch
 * of this template varies: on `with/nft-identity` a placement is free and the
 * stake is custody. The comparison with the reveal holds either way; the shape
 * assertions that name a number are made only where a placement costs one.
 */

const {provider, networkHelpers} = await network.connect();
const {deployAll} = setupFixtures(provider);

function cellAt(x: number, y: number): bigint {
	const ux = BigInt.asUintN(32, BigInt(x));
	const uy = BigInt.asUintN(32, BigInt(y));
	return (uy << 32n) + ux;
}

const SECRET_A =
	'0x0000000000000000000000000000000000000000000000000000000000000a11';
const SECRET_B =
	'0x0000000000000000000000000000000000000000000000000000000000000b22';

type PlayerCell = {
	cellID: bigint;
	totalStake: bigint;
	numClaimants: number;
	playerStake: bigint;
};

describe('the simulation route', function () {
	async function setup() {
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {
			env,
			Game,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			advanceToRevealPhase,
			getCycleNumber,
			getTimestamp,
		} = fixtures;

		const {cycleNumber: start} = getCycleNumber(await getTimestamp());
		await advanceToCycleNumber(start + 2, true);

		const playerA = unnamedAccounts[0];
		const playerB = unnamedAccounts[1];
		const identityA = await enterGame(fixtures, playerA);
		const identityB = await enterGame(fixtures, playerB);
		const placementCost = BigInt(fixtures.linkedData.placementCost);

		/** One cycle in which each listed player commits and reveals a turn. */
		async function playCycle(
			turns: {
				account: `0x${string}`;
				identity: bigint;
				placements: Placement[];
				secret: `0x${string}`;
			}[],
		) {
			for (const turn of turns) {
				await env.execute(Game, {
					account: turn.account,
					functionName: 'makeCommitment',
					args: [
						turn.identity,
						commitmentHashFor(turn.placements, turn.secret, actionsPerReveal),
						TURN_BOND,
						zeroAddress,
					],
				});
			}
			const {cycleNumber} = getCycleNumber(await getTimestamp());
			await advanceToRevealPhase(cycleNumber, true);
			for (const turn of turns) {
				await revealTurn({env, Game}, {...turn, actionsPerReveal});
			}
			await advanceToCycleNumber(cycleNumber + 1, true);
		}

		/** The cells as `identity` sees them, read the way a client reads them. */
		async function load(identity: bigint, cellIDs: bigint[]) {
			return Promise.all(
				cellIDs.map(async (cellID): Promise<PlayerCell> => {
					const cell = (await env.read(Game, {
						functionName: 'getCell',
						args: [cellID],
					})) as {totalStake: bigint; numClaimants: number};
					const playerStake = (await env.read(Game, {
						functionName: 'getStakeOnCell',
						args: [cellID, identity],
					})) as bigint;
					return {
						cellID,
						totalStake: cell.totalStake,
						numClaimants: Number(cell.numClaimants),
						playerStake,
					};
				}),
			);
		}

		async function simulate(cells: PlayerCell[], placements: Placement[]) {
			const outcome = (await env.read(Game, {
				functionName: 'resolvePlacements',
				args: [cells, placements],
			})) as PlayerCell[];
			return outcome.map((cell) => ({
				...cell,
				numClaimants: Number(cell.numClaimants),
			}));
		}

		return {
			fixtures,
			placementCost,
			playerA,
			playerB,
			identityA,
			identityB,
			playCycle,
			load,
			simulate,
		};
	}

	it('previews exactly what the reveal then does', async function () {
		const {
			placementCost,
			playerA,
			playerB,
			identityA,
			identityB,
			playCycle,
			load,
			simulate,
		} = await setup();

		const fresh = cellAt(1, 1);
		const heldByA = cellAt(2, 1);
		const heldByB = cellAt(3, 1);

		// What the board holds before the turn being previewed.
		await playCycle([
			{
				account: playerA,
				identity: identityA,
				placements: [{cellID: heldByA}],
				secret: SECRET_A,
			},
			{
				account: playerB,
				identity: identityB,
				placements: [{cellID: heldByB}],
				secret: SECRET_B,
			},
		]);

		const turn: Placement[] = [
			{cellID: fresh},
			{cellID: heldByA},
			{cellID: heldByB},
		];
		const cellIDs = [fresh, heldByA, heldByB];
		const preview = await simulate(await load(identityA, cellIDs), turn);

		await playCycle([
			{
				account: playerA,
				identity: identityA,
				placements: turn,
				secret: SECRET_A,
			},
		]);

		expect(await load(identityA, cellIDs)).toEqual(preview);
		// And the shapes it was about, so a rule that changed in both places at
		// once is still caught.
		if (placementCost > 0n) {
			expect(preview.map((cell) => cell.numClaimants)).toEqual([1, 1, 2]);
			expect(preview.map((cell) => cell.playerStake)).toEqual([
				placementCost,
				2n * placementCost,
				placementCost,
			]);
		}
	});

	it('resolves a turn that names a cell twice as the reveal does', async function () {
		const {placementCost, playerA, identityA, playCycle, load, simulate} =
			await setup();

		const twice = cellAt(4, 4);
		const turn: Placement[] = [{cellID: twice}, {cellID: twice}];
		const preview = await simulate(await load(identityA, [twice]), turn);

		await playCycle([
			{
				account: playerA,
				identity: identityA,
				placements: turn,
				secret: SECRET_A,
			},
		]);

		expect(await load(identityA, [twice])).toEqual(preview);
		if (placementCost > 0n) {
			expect(preview[0].numClaimants).toEqual(1);
			expect(preview[0].totalStake).toEqual(2n * placementCost);
		}
	});

	it('writes nothing', async function () {
		const {identityA, load, simulate} = await setup();
		const cell = cellAt(5, 5);
		const before = await load(identityA, [cell]);
		await simulate(before, [{cellID: cell}]);
		expect(await load(identityA, [cell])).toEqual(before);
	});

	it('refuses a placement on a cell it was not given, rather than calling it empty', async function () {
		const {fixtures, identityA, load} = await setup();
		const {env, Game} = fixtures;
		const given = await load(identityA, [cellAt(6, 6)]);
		await expect(
			env.read(Game, {
				functionName: 'resolvePlacements',
				args: [given, [{cellID: cellAt(7, 7)}]],
			}),
		).toBeRejectedWith('CellNotGiven');
	});
});

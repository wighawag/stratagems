import {expect, describe, it} from 'vitest';

import {parseGrid, renderGrid, toContractSimpleCell, xyToBigIntID} from 'stratagems-common';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';

import {getGrid, withGrid} from './utils/stratagems';
import {deployStratagemsWithTestConfig, expectGridChange, expectGridChangeAfterActions} from './utils/stratagems-test';
import {parseEther} from 'viem';

describe('Stratagems', function () {
	it('poking on a virtually dead cell sync its state accordingly', async function () {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		const {Stratagems, deployer, config, stratagemsAdmin, Time} = setup;
		await withGrid(
			setup,
			`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    | R1 | B2 |    |    |
		|    | 01 | 02 |    |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
		);
		expect((await Stratagems.read.getRawCell([xyToBigIntID(1, 2)])).life).to.equal(2);
		await Time.write.increaseTime([config.commitPhaseDuration + config.revealPhaseDuration], {
			account: stratagemsAdmin,
		});
		await Stratagems.write.poke([xyToBigIntID(1, 2)], {account: deployer});
		expect((await Stratagems.read.getRawCell([xyToBigIntID(1, 2)])).life).to.equal(0);
	});

	it('reading the virtual state correctly report the number of life', async function () {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		await expect(
			await withGrid(
				setup,
				`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    | R1 | B2 |    |    |
		|    | 01 | 02 |    |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
			)
				.then(() =>
					setup.Time.write.increaseTime([setup.config.commitPhaseDuration + setup.config.revealPhaseDuration], {
						account: setup.stratagemsAdmin,
					}),
				)
				.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
				.then(renderGrid),
		).to.equal(
			renderGrid(
				parseGrid(`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    | R0 | B1 |    |    |
		|    | 01 | 02 |    |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`),
			),
		);
	});

	it('placing a gem should have the desired effect', async function () {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		await expectGridChange(
			setup,
			`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    | R1 |+B +|    |    |
		|    | 01 |+02+|    |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
			`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    | R0 | B0 |    |    |
		|    | 01 | 02 |    |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
		);
	});

	it('placing 2 gems should have the desired effect', async function () {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		await expectGridChange(
			setup,
			`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    |+B +|    |    |
		|    |    |+03+|    |    |
		-------------------------
		|    | R1 |+B +|    |    |
		|    | 01 |+02+|    |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
			`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    | B2 |    |    |
		|    |    | 03 |    |    |
		-------------------------
		|    | R0 | B0 |    |    |
		|    | 01 | 02 |    |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
		);
	});

	it('placing 3 gems should have the desired effect', async function () {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		await expectGridChange(
			setup,
			`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    |+B +|    |    |
		|    |    |+03+|    |    |
		-------------------------
		|    | R2 |+B +|    |    |
		|    | 02 |+02+|    |    |
		-------------------------
		|    |    |    | P1 |+P +|
		|    |    |    | 01 |+01+|
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
			`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    | B2 |    |    |
		|    |    | 03 |    |    |
		-------------------------
		|    | R1 | B0 |    |    |
		|    | 02 | 02 |    |    |
		-------------------------
		|    |    |    | P2 | P2 |
		|    |    |    | 01 | 01 |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`,
		);
	});

	it('multiple non-conflicting actions submission', async function () {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		await setup.TestTokens.write.transfer([setup.otherAccounts[1], parseEther('1')], {
			account: setup.tokensBeneficiary,
		});
		await setup.TestTokens.write.transfer([setup.otherAccounts[2], parseEther('1')], {
			account: setup.tokensBeneficiary,
		});
		await expectGridChangeAfterActions(
			setup,
			`
			-------------------------
			|    |    |    |    |    |
			|    |    |    |    |    |
			-------------------------
			|    |    | B2 |    |    |
			|    |    | 03 |    |    |
			-------------------------
			|    | R1 | B1 |    |    |
			|    | 02 | 02 |    |    |
			-------------------------
			|    |    |    | P2 | P5 |
			|    |    |    | 01 | 01 |
			-------------------------
			|    |    |    |    |    |
			|    |    |    |    |    |
			-------------------------
			`,
			[
				`
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
					|    |    |    |+B  |    |
					|    |    |    | 01 |    |
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
				`,
				`
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
					|+P  |    |    |    |    |
					| 02 |    |    |    |    |
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
					|    |    |    |    |    |
					|    |    |    |    |    |
					-------------------------
					`,
			],
			`
			-------------------------
			|    |    |    |    |    |
			|    |    |    |    |    |
			-------------------------
			|    |    | B4 | B2 |    |
			|    |    | 03 | 01 |    |
			-------------------------
			| P0 | R0 | B0 |    |    |
			| 02 | 02 | 02 |    |    |
			-------------------------
			|    |    |    | P3 | P6 |
			|    |    |    | 01 | 01 |
			-------------------------
			|    |    |    |    |    |
			|    |    |    |    |    |
			-------------------------
			
			`,
		);
	});

	it('poke on dead cell should give tokens to neighboring enemies', async function () {});

	it('forceSimpleCells', async function () {
		const {Stratagems, deployer, otherAccounts} = await loadFixture(deployStratagemsWithTestConfig);
		const grid = parseGrid(`
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		|    |    | B4 |    |    |
		|    |    | 03 |    |    |
		-------------------------
		|    | R1 | B2 | B1 |    |
		|    | 01 | 02 | 04 |    |
		-------------------------
		|    |    |    | P1 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`);
		await Stratagems.write.forceSimpleCells([grid.cells.map(toContractSimpleCell(otherAccounts))], {account: deployer});

		expect((await Stratagems.read.getRawCell([xyToBigIntID(2, 2)])).delta).to.equal(1);
	});
});

import {expect} from './utils/viem-chai';
import {parseGrid, renderGrid, toContractSimpleCell, xyToBigIntID} from 'stratagems-common';

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {contract, getAccounts, publicClient} from '../utils/viem';

import artifacts from '../generated/artifacts';
import {network} from 'hardhat';
import {GameConfig} from '../deploy/003_deploy_game';
import {parseEther} from 'viem';
import {GridEnv, getGrid, performGridActions, withGrid} from './utils/stratagems';

async function expectGridChange(setup: GridEnv, gridWithAction: string, resultGrid: string) {
	await expect(
		await withGrid(setup, gridWithAction)
			.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
			.then(renderGrid)
	).to.equal(renderGrid(parseGrid(resultGrid)));
}

async function expectGridChangeAfterActions(setup: GridEnv, grid: string, actionGrids: string[], resultGrid: string) {
	await expect(
		await withGrid(setup, grid)
			.then(() => performGridActions(setup, actionGrids))
			.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
			.then(renderGrid)
	).to.equal(renderGrid(parseGrid(resultGrid)));
}

async function deployStratagems(config?: Partial<GameConfig>) {
	const [deployer, tokensBeneficiary, ...otherAccounts] = await getAccounts();

	const {deployments} = await loadAndExecuteDeployments(
		{
			provider: network.provider as any,
			// logLevel: 6,
		},
		config
	);

	const TestTokens = contract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
	const Stratagems = contract(deployments['Stratagems'] as Deployment<typeof artifacts.IStratagemsWithDebug.abi>);

	await TestTokens.write.transfer([deployer, parseEther('1000')], {account: tokensBeneficiary});
	await TestTokens.write.approve([Stratagems.address, parseEther('1000')], {account: deployer});

	return {
		deployer,
		stratagemsAdmin: deployer, // TODO
		tokensBeneficiary,
		Stratagems,
		TestTokens,
		config,
		otherAccounts,
	};
}

async function deployStratagemsWithTestConfig() {
	const config = {
		startTime: Number((await publicClient.getBlock()).timestamp),
	};
	return deployStratagems(config);
}

describe('Stratagems', function () {
	it('poking on a virtually dead cell sync its state accordingly', async function () {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		const {Stratagems, deployer} = setup;
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
		`
		);
		expect((await Stratagems.read.getRawCell([xyToBigIntID(1, 2)])).life).to.equal(1);
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
		`
			)
				.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
				.then(renderGrid)
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
		|    |    |    | P0 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`)
			)
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
		|    |    |    | P0 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`
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
		|    |    |    | P0 |    |
		|    |    |    | 01 |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`
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
		|    | R0 | B0 |    |    |
		|    | 02 | 02 |    |    |
		-------------------------
		|    |    |    | P0 | P2 |
		|    |    |    | 01 | 01 |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`
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

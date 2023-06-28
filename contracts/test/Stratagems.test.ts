import {expect} from './utils/viem-chai';
import {parseGrid, renderGrid, toContractCell, xyToBigIntID} from 'stratagems-common';

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {contract, getAccounts} from '../utils/viem';

import artifacts from '../generated/artifacts';
import {network} from 'hardhat';
import {GameConfig} from '../deploy/003_deploy_game';
import {parseEther} from 'viem';

async function deployStratagems(config?: Partial<GameConfig>) {
	const [deployer, tokensBeneficiary, ...otherAccounts] = await getAccounts();

	const {deployments} = await loadAndExecuteDeployments(
		{
			provider: network.provider as any,
			logLevel: 6,
		},
		config
	);

	const TestTokens = contract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
	const Stratagems = contract(deployments['Stratagems'] as Deployment<typeof artifacts.IStratagemsWithDebug.abi>);

	return {
		deployer,
		tokensBeneficiary,
		Stratagems,
		TestTokens,
		config,
		otherAccounts,
	};
}

async function deployStratagemsWithTestConfig() {
	const config = {
		startTime: Math.floor(Date.now() / 1000),
	};
	return deployStratagems(config);
}

describe('Stratagems', function () {
	it('poke on dead cell should give tokens to neighboring enemies', async function () {
		const {TestTokens, Stratagems, deployer, otherAccounts, tokensBeneficiary} = await loadFixture(
			deployStratagemsWithTestConfig
		);
		const grid = parseGrid(`
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
		|    |    |    |    |    |
		-------------------------
		|    |    |    |    |    |
		|    |    |    |    |    |
		-------------------------
		`);

		const config = await Stratagems.read.getConfig();
		console.log(config);

		await TestTokens.write.transfer([deployer, parseEther('1000')], {account: tokensBeneficiary});
		await TestTokens.write.approve([Stratagems.address, parseEther('1000')], {account: deployer});

		await Stratagems.write.forceSimpleCells([grid.cells.map(toContractCell(otherAccounts))], {account: deployer});

		const cell = await Stratagems.read.cells([xyToBigIntID(1, 2)]);
		console.log(cell);
	});
});

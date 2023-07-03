import {expect} from 'vitest';
import './viem-matchers';

import {parseGrid, renderGrid} from 'stratagems-common';

import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {getConnection, fetchContract} from '../../utils/connection';

import artifacts from '../../generated/artifacts';
import {network} from 'hardhat';

import {GameConfig} from '../../deploy/003_deploy_game';
import {parseEther} from 'viem';
import {GridEnv, getGrid, performGridActions, withGrid} from './stratagems';

export async function expectGridChange(setup: GridEnv, gridWithAction: string, resultGrid: string) {
	await expect(
		await withGrid(setup, gridWithAction)
			.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
			.then(renderGrid)
	).to.equal(renderGrid(parseGrid(resultGrid)));
}

export async function expectGridChangeAfterActions(
	setup: GridEnv,
	grid: string,
	actionGrids: {player: number; grid: string}[],
	resultGrid: string
) {
	await expect(
		await withGrid(setup, grid)
			.then(() => performGridActions(setup, actionGrids))
			.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
			.then(renderGrid)
	).to.equal(renderGrid(parseGrid(resultGrid)));
}

async function deployStratagems(override?: Partial<GameConfig>) {
	const {accounts, walletClient, publicClient} = await getConnection();
	const [deployer, tokensBeneficiary, ...otherAccounts] = accounts;

	const {deployments} = await loadAndExecuteDeployments(
		{
			provider: network.provider as any,
			// logLevel: 6,
		},
		override
	);

	const TestTokens = await fetchContract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
	const Stratagems = await fetchContract(
		deployments['Stratagems'] as Deployment<typeof artifacts.IStratagemsWithDebug.abi>
	);

	const config = await Stratagems.read.getConfig();

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

export async function deployStratagemsWithTestConfig() {
	const {publicClient} = await getConnection();
	const override = {
		startTime: Number((await publicClient.getBlock()).timestamp),
	};
	const result = await deployStratagems(override);
	return result;
}

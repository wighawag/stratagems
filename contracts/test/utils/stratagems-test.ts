import {expect} from 'vitest';
import './viem-matchers';
import solidityKitArtifacts from 'solidity-kit/generated/artifacts';

import {parseGrid, renderGrid, Grid, Cell, bigIntIDToXY, StratagemsContract, xyToBigIntID} from 'stratagems-common';
import {Data, createProcessor} from 'stratagems-indexer';
import {createIndexerState} from 'ethereum-indexer-browser';

import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {getConnection, fetchContract} from '../../utils/connection';

import artifacts from '../../generated/artifacts';
import {network} from 'hardhat';

import {GameConfig} from '../../deploy/011_deploy_game';
import {formatEther, parseEther} from 'viem';
import {GridEnv, getGrid, performGridActions, withGrid} from './stratagems';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';

export async function expectGridChange(setup: GridEnv, gridWithAction: string, resultGrid: string) {
	await expect(
		await withGrid(setup, gridWithAction)
			.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
			.then(renderGrid),
	).to.equal(renderGrid(parseGrid(resultGrid)));
}

export async function expectGridChangeAfterActions(
	setup: GridEnv,
	grid: string,
	actionGrids: string[],
	resultGrid: string,
) {
	await expect(
		await withGrid(setup, grid)
			.then(() => performGridActions(setup, actionGrids))
			.then(() => getGrid(setup, {x: 0, y: 0, width: 5, height: 5}))
			.then(renderGrid),
	).to.equal(renderGrid(parseGrid(resultGrid)));
}

export async function setupWallets(env: GridEnv, walletsBefore: {[playerIndex: number]: number}) {
	for (const playerIndex of Object.keys(walletsBefore)) {
		const player = env.otherAccounts[playerIndex];
		const amount = await env.TestTokens.read.balanceOf([player]);
		const expectedAmount = parseEther(walletsBefore[playerIndex].toString());
		const amountToTransfer = expectedAmount - amount;
		if (amountToTransfer > 0) {
			await env.TestTokens.write.transfer([player, amountToTransfer], {
				account: env.tokensBeneficiary,
			});
		} else if (amountToTransfer < 0) {
			throw new Error(`too much token`);
		}
	}
}

export async function expectIndexedGridToMatch(env: GridEnv, resultGrid: string, epoch: number) {
	const processor = createProcessor();
	const {state, syncing, status, init, indexToLatest} = createIndexerState(processor);
	// console.log('--------------------------------------------------------');
	// console.log(state.$state);
	// console.log('--------------------------------------------------------');
	await init({
		provider: env.provider,
		source: {
			chainId: '31337',
			contracts: [{abi: env.Stratagems.abi as any, address: env.Stratagems.address}],
		},
	}).then((v) => indexToLatest());
	// console.log('- INDEXED -------------------------------------------------------');
	// console.log(state.$state);
	// console.log('--------------------------------------------------------');
	const grid = fromStateToGrid(env, state.$state, epoch);
	// console.log(grid);
	// TODO reenable
	await expect(renderGrid(grid)).to.equal(renderGrid(parseGrid(resultGrid)));
}

export function fromStateToGrid(env: GridEnv, state: Data, epoch: number): Grid {
	const stratagemsContract = new StratagemsContract(state, 7); // TODO MAX_LIFE
	const gridCells: Cell[] = [];
	// let minX = 0;
	// let minY = 0;
	// let maxX = 0;
	// let maxY = 0;

	// console.log('FROM STATE TO GRID 3,1');
	// console.log(state.cells[xyToBigIntID(3, 1).toString()]);

	for (const positionString of Object.keys(state.cells)) {
		const position = BigInt(positionString);
		const {updatedCell: cell} = stratagemsContract.getUpdatedCell(position, epoch);

		const {x, y} = bigIntIDToXY(position);
		const ownerAddress = state.owners[positionString];
		const accountIndex = env.otherAccounts.findIndex((v) => v.toLowerCase() === ownerAddress?.toLowerCase());
		let owner: undefined | number = undefined;
		if (accountIndex >= 0) {
			owner = accountIndex;
		} else if (ownerAddress.toLowerCase() == '0xffffffffffffffffffffffffffffffffffffffff') {
			owner = -1;
		}
		const gridCell = {
			x,
			y,
			owner,
			color: cell.color,
			life: cell.life,
			lastEpochUpdate: cell.lastEpochUpdate,
			epochWhenTokenIsAdded: cell.epochWhenTokenIsAdded,
			delta: cell.delta,
			enemyMap: cell.enemyMap,
		};
		gridCells.push(gridCell);

		const epochDelta = epoch - cell.lastEpochUpdate;
		if (epochDelta > 0 && gridCell.life > 0) {
			gridCell.life += gridCell.delta * epochDelta;
			if (gridCell.life > 7) {
				// TODO MAX_LIFE
				gridCell.life = 7;
			}
			if (gridCell.life < 0) {
				gridCell.life = 0;
			}
		}
	}
	return {
		cells: gridCells,
		width: 5,
		height: 5,
	};
}

export async function expectWallet(env: GridEnv, expectedWalletsAfter: {[playerIndex: number]: number}) {
	for (const playerIndex of Object.keys(expectedWalletsAfter)) {
		const player = env.otherAccounts[playerIndex];
		const amount = await env.TestTokens.read.balanceOf([player]);
		// console.log({
		// 	player: playerIndex,
		// 	amount: formatEther(amount),
		// });
	}
	for (const playerIndex of Object.keys(expectedWalletsAfter)) {
		const player = env.otherAccounts[playerIndex];
		const amount = await env.TestTokens.read.balanceOf([player]);
		const expectedAmount = parseEther(expectedWalletsAfter[playerIndex].toString());
		expect(amount, `player ${playerIndex} (${player})`).to.equal(expectedAmount);
	}
}

async function deployStratagems(override?: Partial<GameConfig>) {
	const {accounts, walletClient, publicClient} = await getConnection();
	const [deployer, tokensBeneficiary, ...otherAccounts] = accounts;

	const provider = network.provider as EIP1193ProviderWithoutEvents;
	const {deployments} = await loadAndExecuteDeployments(
		{
			provider,
			// logLevel: 6,
		},
		override,
	);

	const TestTokens = await fetchContract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
	const Gems = await fetchContract(deployments['Gems'] as Deployment<typeof artifacts.Gems.abi>);
	const Stratagems = await fetchContract(
		deployments['Stratagems'] as Deployment<typeof artifacts.IStratagemsWithDebug.abi>,
	);
	const Time = await fetchContract(deployments['Time'] as Deployment<typeof solidityKitArtifacts.Time.abi>);

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
		provider: provider as any,
		Gems,
		Time,
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

export async function pokeAll(env: GridEnv, resultGrid: string, epoch: number) {
	const processor = createProcessor();
	const {state, syncing, status, init, indexToLatest} = createIndexerState(processor);

	// keep grid already
	await init({
		provider: env.provider,
		source: {
			chainId: '31337',
			contracts: [{abi: env.Stratagems.abi as any, address: env.Stratagems.address}],
		},
	}).then((v) => indexToLatest());

	const {accounts, walletClient, publicClient} = await getConnection();
	const [deployer] = accounts;
	await env.Stratagems.write.pokeMultiple([Object.keys(state.$state.cells).map((v) => BigInt(v))], {account: deployer});
}

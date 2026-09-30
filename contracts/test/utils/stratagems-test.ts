import {expect} from 'vitest';
import solidityKitArtifacts from 'solidity-kit/generated/artifacts.js';

import {
	parseGrid,
	renderGrid,
	Grid,
	Cell,
	bigIntIDToXY,
	StratagemsContract,
	xyToBigIntID,
	EVIL_OWNER_ADDRESS,
} from 'stratagems-common';
import {Data, readState, stratagemsProcessor} from 'stratagems-indexer';
import {indexInProcess} from '../../utils/indexer.js';

import type {Deployment} from 'rocketh/types';
import {loadAndExecuteDeploymentsFromFiles} from '../../rocketh/environment.js';

import {getConnection, fetchContract, hardhatProvider} from '../../utils/connection.js';

import * as abis from '../../generated/abis/index.js';
import * as artifacts from '../../generated/artifacts/index.js';

import type {GameConfig} from '../../deploy/020_deploy_game.js';
import {formatEther, parseEther} from 'viem';
import {GridEnv, getGrid, performGridActions, withGrid} from './stratagems.js';
import {EIP1193GenericRequestProvider, EIP1193ProviderWithoutEvents} from 'eip-1193';

export type WalletBalance = {stakingToken: bigint; points?: bigint};

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

export async function setupWallets(env: GridEnv, walletsBefore: {[playerIndex: number]: WalletBalance}) {
	for (const playerIndex of Object.keys(walletsBefore)) {
		const player = Number(playerIndex) >= 0 ? env.otherAccounts[playerIndex] : EVIL_OWNER_ADDRESS;
		const amount = await env.TestTokens.read.balanceOf([player]);
		const expectedAmount: WalletBalance = walletsBefore[playerIndex];
		const amountToTransfer = expectedAmount.stakingToken - amount;
		if (amountToTransfer > 0) {
			await env.TestTokens.write.transfer([player, amountToTransfer], {
				account: env.tokensBeneficiary,
			});
		} else if (amountToTransfer < 0) {
			throw new Error(`too much token`);
		}
	}
}

/** Index the local chain with the stratagems processor, and read the whole state back (as the web app does). */
async function indexedState(env: GridEnv): Promise<Data> {
	const indexed = await indexInProcess({
		processor: stratagemsProcessor,
		provider: env.provider,
		source: {
			chainId: '31337',
			contracts: [{abi: env.Stratagems.abi as any, address: env.Stratagems.address}],
		},
	});
	try {
		return (await readState(indexed.execute)).data;
	} finally {
		indexed.close();
	}
}

export async function expectIndexedGridToMatch(env: GridEnv, resultGrid: string, epoch: number) {
	const state = await indexedState(env);
	const grid = fromStateToGrid(env, state, epoch);
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
		} else if (ownerAddress.toLowerCase() == EVIL_OWNER_ADDRESS.toLowerCase()) {
			owner = -cell.stake;
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
			stake: cell.stake,
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

export async function expectWallet(env: GridEnv, expectedWalletsAfter: {[playerIndex: number]: WalletBalance}) {
	for (const playerIndex of Object.keys(expectedWalletsAfter)) {
		const player = Number(playerIndex) >= 0 ? env.otherAccounts[playerIndex] : EVIL_OWNER_ADDRESS;
		const amount = await env.TestTokens.read.balanceOf([player]);
		// console.log({
		// 	player: playerIndex,
		// 	amount: formatEther(amount),
		// });
	}
	for (const playerIndex of Object.keys(expectedWalletsAfter)) {
		const player = Number(playerIndex) >= 0 ? env.otherAccounts[playerIndex] : EVIL_OWNER_ADDRESS;
		const stakingTokenAmount = await env.TestTokens.read.balanceOf([player]);

		const expectedAmount: WalletBalance = expectedWalletsAfter[playerIndex];
		expect(stakingTokenAmount, `player ${playerIndex} (${player}) staking token`).to.equal(expectedAmount.stakingToken);
		if (expectedAmount.points) {
			const pointsTokenAmount = await env.GemsGenerator.read.balanceOf([player]);
			expect(pointsTokenAmount, `player ${playerIndex} (${player}) points`).to.equal(expectedAmount.points);
		}
	}
}

async function deployStratagems(override?: Partial<GameConfig>) {
	const {accounts, walletClient, publicClient} = await getConnection();
	const [deployer, tokensBeneficiary, ...otherAccounts] = accounts;

	const provider = hardhatProvider as unknown as EIP1193GenericRequestProvider;
	// the override is the deploy scripts' ARGUMENTS (020_deploy_game reads it)
	const {deployments} = await loadAndExecuteDeploymentsFromFiles({provider: hardhatProvider}, override);

	const TestTokens = await fetchContract(deployments['TestTokens'] as Deployment<typeof abis.TestTokens>);
	const Gems = await fetchContract(deployments['Gems'] as Deployment<typeof abis.Gems>);
	const GemsGenerator = await fetchContract(deployments['GemsGenerator'] as Deployment<typeof abis.RewardsGenerator>);
	const Stratagems = await fetchContract(deployments['Stratagems'] as Deployment<typeof abis.IStratagemsWithDebug>);
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
		GemsGenerator,
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
	const state = await indexedState(env);

	const {accounts, walletClient, publicClient} = await getConnection();
	const [deployer] = accounts;
	await env.Stratagems.write.pokeMultiple([Object.keys(state.cells).map((v) => BigInt(v))], {account: deployer});
}

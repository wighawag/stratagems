import {expect, describe, it} from 'vitest';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {
	deployStratagemsWithTestConfig,
	expectGridChangeAfterActions,
	expectIndexedGridToMatch,
	expectWallet,
	pokeAll,
	setupWallets,
} from './utils/stratagems-test';

const scenarioFolder = path.join(__dirname, 'scenarios');
const scenarios = fs
	.readdirSync(scenarioFolder)
	.sort()
	.map((filename) => {
		const content = fs.readFileSync(path.join(scenarioFolder, filename), 'utf-8');
		const lines = content.split(`\n`);
		let startGrid = '';
		const state: {
			gridConsumed: boolean;
			currentAction?: string;
			timeForExpected: boolean;
		} = {
			gridConsumed: false,
			currentAction: undefined,
			timeForExpected: false,
		};
		const actions: string[] = [];
		let expectedGrid = '';
		let stage: 'before' | 'after' | 'after_poke' = 'before';
		const walletsBefore: {[playerIndex: number]: number} = {};
		const expectedWalletsAfter: {[playerIndex: number]: number} = {};
		const expectedWalletsAfterPoke: {[playerIndex: number]: number} = {};
		for (const line of lines) {
			if (line === 'AFTER_POKE_ALL') {
				stage = 'after_poke';
			} else if (line.startsWith('$')) {
				const [playerIndex, amount] = line
					.slice(1)
					.split(':')
					.map((s) => s.trim())
					.map((s) => parseFloat(s));
				if (stage === 'before') {
					walletsBefore[playerIndex] = amount;
				} else if (stage === 'after') {
					expectedWalletsAfter[playerIndex] = amount;
				} else {
					expectedWalletsAfterPoke[playerIndex] = amount;
				}
			} else if (line.startsWith('+')) {
				state.gridConsumed = true;
				if (typeof state.currentAction !== 'undefined') {
					actions.push(state.currentAction);
				}
				state.currentAction = '';
			} else if (line.startsWith('=')) {
				if (typeof state.currentAction !== 'undefined') {
					actions.push(state.currentAction);
				}
				state.timeForExpected = true;
			} else {
				if (!state.gridConsumed) {
					startGrid += line + `\n`;
				} else if (state.timeForExpected) {
					expectedGrid += line + `\n`;
					stage = 'after';
				} else if (typeof state.currentAction !== 'undefined') {
					state.currentAction += line + `\n`;
				}
			}
		}
		const data = {
			name: path.basename(filename, '.txt'),
			walletsBefore,
			expectedWalletsAfter,
			startGrid,
			actions,
			expectedGrid,
			expectedWalletsAfterPoke,
			expectedWallets: {},
		};
		return data;
	});

describe('Stratagems Scenarios', function () {
	// it.each([scenarios[7]])(`$name`, async (data) => {
	it.each(scenarios)(`$name`, async (data) => {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		await setupWallets(setup, data.walletsBefore);
		await expectGridChangeAfterActions(setup, data.startGrid, data.actions, data.expectedGrid);
		await expectWallet(setup, data.expectedWalletsAfter);
		await expectIndexedGridToMatch(setup, data.expectedGrid, 3);
		await pokeAll(setup, data.expectedGrid, 3);
		await expectWallet(setup, data.expectedWalletsAfterPoke);
	});
});

import {expect, describe, it} from 'vitest';
import './utils/viem-matchers';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {
	deployStratagemsWithTestConfig,
	expectGridChangeAfterActions,
	expectWallet,
	setupWallets,
} from './utils/stratagems-test';

const scenarioFolder = path.join(__dirname, 'scenarios');
const scenarios = fs.readdirSync(scenarioFolder).map((filename) => {
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
	const walletsBefore: {[playerIndex: number]: number} = {};
	const expectedWalletsAfter: {[playerIndex: number]: number} = {};
	for (const line of lines) {
		if (line.startsWith('$')) {
			const [playerIndex, amount] = line
				.slice(1)
				.split(':')
				.map((s) => s.trim())
				.map((s) => parseFloat(s));
			if (!expectedGrid) {
				walletsBefore[playerIndex] = amount;
			} else {
				expectedWalletsAfter[playerIndex] = amount;
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
		expectedWallets: {},
	};
	return data;
});

describe('Stratagems Scenarios', function () {
	it.each(scenarios)(`$name`, async (data) => {
		const setup = await loadFixture(deployStratagemsWithTestConfig);
		await setupWallets(setup, data.walletsBefore);
		await expectGridChangeAfterActions(setup, data.startGrid, data.actions, data.expectedGrid);
		await expectWallet(setup, data.expectedWalletsAfter);
	});
});

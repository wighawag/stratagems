import {expect} from './chai-setup';
import {getCurrentPeriodInfo, setTimestamp} from './utils/time';
import {parseEther} from 'ethers/lib/utils';
import {BigNumber, BigNumberish, constants} from 'ethers';
import {toEventArgs} from './utils/events';
import {print} from './utils/debug';
import {
	composeCommitment,
	composeCommitmentByUserIndex,
	composeResolution,
	composeResolutionByUserIndex,
	expectCellToEqual,
	setup,
} from './setup';
import fs from 'fs';
import path from 'path';

describe('Game Scenarios', function () {
	const files = fs.readdirSync(path.join(__dirname, 'data/scenarios'));
	for (const filename of files) {
		const content = fs.readFileSync(path.join(__dirname, 'data/scenarios', filename), 'utf-8');
		const json = JSON.parse(content);

		let runN = 0;
		for (const run of json.runs) {
			it(`run ${runN}`, async () => {
				let actualContent = content;
				for (const replacement of Object.keys(run.input)) {
					const value = run.input[replacement];
					actualContent = actualContent.replace(replacement, value);
				}
				const runJson = JSON.parse(actualContent);

				for (const round of runJson.rounds) {
					const state = await setup();
					const commitments: {[i: string]: {secret: string}} = {};
					// commitments
					for (const playerIndex of Object.keys(round.players)) {
						const actions = round.players[playerIndex];
						if (actions.moves) {
							const numTokensToAddToReserve = parseEther(actions.moves.length.toString());
							const makeCommitment = await composeCommitmentByUserIndex(state, parseInt(playerIndex), {
								numTokensToAddToReserve,
								moves: actions.moves,
							});
							await makeCommitment.perform();
							commitments[playerIndex] = {
								secret: makeCommitment.secret,
							};
						}
					}

					const currentPeriodInfo = await getCurrentPeriodInfo(state.linkedData);
					if (currentPeriodInfo.resolutionDelta > 0) {
						await setTimestamp(currentPeriodInfo.resolutionDelta + currentPeriodInfo.currentTimestamp);
					}

					// resolutions
					for (const playerIndex of Object.keys(round.players)) {
						const actions = round.players[playerIndex];
						if (actions.moves) {
							const makeResolution = await composeResolutionByUserIndex(state, parseInt(playerIndex), {
								moves: actions.moves,
								secret: commitments[playerIndex].secret,
							});
							await makeResolution.perform();
						}
					}
				}
			});
			runN++;
		}
	}
});

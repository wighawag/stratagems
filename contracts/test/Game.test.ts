import {expect} from './chai-setup';
import {getCurrentPeriodInfo, setTimestamp} from './utils/time';
import {parseEther} from 'ethers/lib/utils';
import {BigNumber, constants} from 'ethers';
import {toEventArgs} from './utils/events';
import {print} from './utils/debug';
import {
	CommitmentHashZero,
	composeCommitment,
	composeCommitmentByUserIndex,
	composeResolution,
	composeResolutionByUserIndex,
	expectCellToEqual,
	setup,
} from './setup';

describe('Game', function () {
	it('makeCommitment works', async function () {
		const state = await setup();
		const fakeCommitmentHash = '0x000000000000000000000000000000000000000000000000';
		const numTokensToAddToReserve = parseEther('1');
		const makeCommitment = await composeCommitmentByUserIndex(state, 0, {
			moves: [],
			commitmentHash: fakeCommitmentHash,
			numTokensToAddToReserve,
		});

		const period = 1;
		await expect(makeCommitment.perform())
			.to.emit(state.Game, 'CommitmentMade')
			.withArgs(state.users[0].address, period, fakeCommitmentHash);
	});

	it('makeCommitment get resolved', async function () {
		const state = await setup();
		const numTokensToAddToReserve = parseEther('1');
		const moves = [
			{
				position: BigNumber.from('0'),
				color: 2,
			},
		];
		const makeCommitment = await composeCommitmentByUserIndex(state, 0, {
			moves,
			numTokensToAddToReserve,
		});
		await makeCommitment.perform();

		const currentPeriodInfo = await getCurrentPeriodInfo(state.linkedData);
		if (currentPeriodInfo.resolutionDelta > 0) {
			await setTimestamp(currentPeriodInfo.resolutionDelta + currentPeriodInfo.currentTimestamp);
		}

		const resolveCommitment = composeResolutionByUserIndex(state, 0, {
			moves,
			secret: makeCommitment.secret,
		});

		const period = 1;
		await expect(resolveCommitment.perform())
			.to.emit(state.Game, 'CommitmentResolved')
			.withArgs(state.users[0].address, period, makeCommitment.hash, toEventArgs(moves), CommitmentHashZero);

		const cell = await state.Game.callStatic.cells(moves[0].position);
		expectCellToEqual(cell, {
			owner: state.users[0].address,
			lastPeriodUpdate: 1,
			periodWhenTokenIsAdded: 1,
			color: moves[0].color,
			life: 1,
			delta: 0,
			enemymask: 0,
		});
		expect(cell[0]).to.eq(state.users[0].address); // address owner;
		expect(cell[1]).to.eq(1); // uint32 lastPeriodUpdate; // period
		expect(cell[2]).to.eq(1); // uint32 periodWhenTokensIsAdded; // period
		expect(cell[3]).to.eq(moves[0].color); // Color color;
		expect(cell[4]).to.eq(1); // int8 life;
		expect(cell[5]).to.eq(0); // int8 delta;
		expect(cell[6]).to.eq(0); // uint8 enemymask;
	});

	it('2 move with same position get resolved in collision', async function () {
		const state = await setup();
		const numTokensToAddToReserve = parseEther('1');
		const moves = [
			{
				position: BigNumber.from('0'),
				color: 2,
			},
		];

		const p0_makeCommitment = await composeCommitmentByUserIndex(state, 0, {
			moves,
			numTokensToAddToReserve,
		});
		await p0_makeCommitment.perform();

		const p1_makeCommitment = await composeCommitmentByUserIndex(state, 1, {
			moves,
			numTokensToAddToReserve,
		});
		await p1_makeCommitment.perform();

		const currentPeriodInfo = await getCurrentPeriodInfo(state.linkedData);
		if (currentPeriodInfo.resolutionDelta > 0) {
			await setTimestamp(currentPeriodInfo.resolutionDelta + currentPeriodInfo.currentTimestamp);
		}

		const p0_resolveCommitment = composeResolutionByUserIndex(state, 0, {
			moves,
			secret: p0_makeCommitment.secret,
		});

		const p1_resolveCommitment = composeResolutionByUserIndex(state, 1, {
			moves,
			secret: p1_makeCommitment.secret,
		});

		const period = 1;
		await expect(p0_resolveCommitment.perform())
			.to.emit(state.Game, 'CommitmentResolved')
			.withArgs(state.users[0].address, period, p0_makeCommitment.hash, toEventArgs(moves), CommitmentHashZero);

		await expect(p1_resolveCommitment.perform())
			.to.emit(state.Game, 'CommitmentResolved')
			.withArgs(state.users[1].address, period, p1_makeCommitment.hash, toEventArgs(moves), CommitmentHashZero);

		const cell = await state.Game.callStatic.cells(moves[0].position);
		expectCellToEqual(cell, {
			owner: constants.AddressZero,
			lastPeriodUpdate: 0,
			periodWhenTokenIsAdded: 1,
			color: 0,
			life: 0,
			delta: 0,
			enemymask: 0,
		});
	});
});

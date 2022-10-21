import {TransactionResponse} from '@ethersproject/abstract-provider';
import {ContractReceipt} from 'ethers';
import {ethers} from 'hardhat';

export async function timestamp(): Promise<number> {
	// ensure the block is mined to get latest timestamp
	// TODO better way ?
	// like keep track of time when `evm_setNextBlockTimestamp` is executed and check next mined block
	try {
		await ethers.provider.send('evm_mine', []);
		const lastBlock = await ethers.provider.getBlock('latest');
		return lastBlock.timestamp;
	} catch (e) {
		return Math.floor(Date.now() / 1000);
	}
}

export async function setTimestamp(newTimestamp: number) {
	await ethers.provider.send('evm_setNextBlockTimestamp', [newTimestamp]);
}

export async function getCurrentPeriodInfo(config: {
	startTime: number;
	commitPeriod: number;
	resolutionPeriod: number;
}) {
	const periodDuration = config.commitPeriod + config.resolutionPeriod;
	const currentTimestamp = await timestamp();
	if (currentTimestamp < config.startTime) {
		throw new Error('GAME_NOT_STARTED');
	}
	const timePassed = currentTimestamp - config.startTime;
	const period = Math.floor(timePassed / periodDuration + 1); // period start at 1
	const resolutionDelta = config.commitPeriod - (timePassed - (period - 1) * periodDuration);
	const commiting = resolutionDelta > 0;
	return {commiting, period, timePassed, resolutionDelta, currentTimestamp};
}

export function waitForTx(tx: Promise<TransactionResponse>): Promise<ContractReceipt> {
	return tx.then((v) => v.wait());
}

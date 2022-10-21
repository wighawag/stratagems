import {TransactionResponse} from '@ethersproject/abstract-provider';
import {ContractReceipt} from 'ethers';
import {ethers} from 'hardhat';

export async function timestamp(): Promise<number> {
	// ensure the block is mined to get latest timestamp
	// TODO better way ?
	// like keep track of time when `evm_setNextBlockTimestamp` is executed and check next mined block
	await ethers.provider.send('evm_mine', []);
	const lastBlock = await ethers.provider.getBlock('latest');
	return lastBlock.timestamp;
}

export async function setTimestamp(newTimestamp: number) {
	await ethers.provider.send('evm_setNextBlockTimestamp', [newTimestamp]);
}


export function waitForTx(tx: Promise<TransactionResponse>): Promise<ContractReceipt> {
	return tx.then((v) => v.wait());
}

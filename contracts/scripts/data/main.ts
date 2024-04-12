import {createIndexerState} from 'ethereum-indexer-browser';
import {keepStreamOnFile} from 'ethereum-indexer-fs';
import contractsInfo from './contracts';
import hre from 'hardhat';
import {createProcessor} from 'stratagems-indexer';

export const processor = createProcessor();
export const {state, init, indexToLatest} = createIndexerState(processor, {
	keepStream: keepStreamOnFile('.data', 'stratagems'),
});

export async function indexAll() {
	await init({
		provider: hre.network.provider as any, // TOD type
		source: {
			chainId: contractsInfo.chainId,
			contracts: Object.keys(contractsInfo.contracts).map((name) => (contractsInfo as any).contracts[name]),
			genesisHash: contractsInfo.genesisHash,
		},
	});
	await indexToLatest();
	return state.$state;
}

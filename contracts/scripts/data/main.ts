import {createIndexerState} from 'ethereum-indexer-browser';
import {keepStreamOnFile} from 'ethereum-indexer-fs';
import contractsInfo from './contracts';
import hre from 'hardhat';
import {createProcessor} from 'stratagems-indexer';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';

export const processor = createProcessor();
export const {state, init, indexToLatest} = createIndexerState(processor, {
	keepStream: keepStreamOnFile('.data', 'stratagems'),
});

export async function indexAll() {
	const env = await loadEnvironmentFromHardhat({hre}, {useChainIdOfForkedNetwork: true});
	await init({
		provider: env.network.provider,
		source: {
			chainId: contractsInfo.chainId,
			contracts: Object.keys(contractsInfo.contracts).map((name) => (contractsInfo as any).contracts[name]),
			genesisHash: contractsInfo.genesisHash,
		},
	});
	await indexToLatest();
	return state.$state;
}

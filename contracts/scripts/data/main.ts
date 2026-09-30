import contractsInfo from './contracts.js';
import hre from 'hardhat';
import {indexingSource, readState, stratagemsProcessor, STREAM_FINALITY} from 'stratagems-indexer';
import {loadEnvironmentFromHardhat} from '../../rocketh/environment.js';
import {indexInProcess} from '../../utils/indexer.js';

/**
 * The whole stratagems state of the network the script runs against, indexed with
 * the same processor and source as the web app and the snapshot job, kept in
 * `.data/stratagems-<name>.db` (SQLite), so a second run resumes from its cursor.
 */
export async function indexAll() {
	const env = await loadEnvironmentFromHardhat({hre});
	const indexed = await indexInProcess({
		processor: stratagemsProcessor,
		provider: env.network.provider,
		source: indexingSource(contractsInfo),
		finality: STREAM_FINALITY,
		db: `file:.data/stratagems-${contractsInfo.name}.db`,
	});
	try {
		return (await readState(indexed.execute)).data;
	} finally {
		indexed.close();
	}
}

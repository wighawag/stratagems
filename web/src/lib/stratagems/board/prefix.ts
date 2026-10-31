/**
 * stratagems' word for its indexer's workers and databases
 * (`$lib/indexer/worker-choice`): `stratagems-<chain>-<game>` elects a live
 * chain's indexing tab, `stratagems-<stream>` is its database, and
 * `stratagems-world-<chainId>` an offline world's. A browser that indexed
 * before step X1 keeps its databases under exactly these names.
 */
export const INDEXER_PREFIX = 'stratagems';

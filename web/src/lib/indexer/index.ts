/**
 * A GAME'S INDEXED STATE: what the tab imports. The worker side is `./host.ts`,
 * imported by the game's two worker entries only. See `./README.md`.
 */
export {
	createIndexedState,
	type BlockTimestamps,
	type IndexedStateOptions,
	type IndexedStateStore,
	type IndexerHost,
} from './indexed-state';
export {
	BLOCK_NOT_RECORDED,
	createStateFollower,
	partsMovedBy,
	StateQueryError,
	type BlockRef,
	type Execute,
	type Moved,
	type QueryAnswer,
	type StateFollower,
	type StateFollowerSpec,
	type StateRead,
} from './follower';
export {
	assertStampable,
	FIRST_CYCLE_NUMBER,
	stampedCycleNumber,
	stampNeedsTimestamp,
	UnstampableCyclePolicyError,
} from './cycle-stamp';
export {
	deleteWorldIndex,
	indexerWorkerFor,
	worldIndexDatabasePrefix,
	type IndexerWorker,
} from './worker-choice';

# `$lib/indexer`: a game's indexed state, hosted

**What this is for.** A game whose state is best built from its events (a long cycle, a board too big to poll by camera, history the contract does not keep) writes an etherfold `EntityProcessor`, and this module runs it in the three places a game needs it: a live chain's worker, an offline world's worker, and a Node process. The processor, its entities and its GraphQL questions are the GAME's (a game's indexer logic is its own); what every game would otherwise repeat is here. It lives on the `with/indexer` node, not on `main`, because a fast game reads logs or polls (the reference game on `main` polls by camera) and should not carry etherfold's install.

## What a game writes

1. **Its processor** (`declareEntities` and an `on<Event>` handler per event it folds), and its **source**: its contracts and, of each ABI, only the events a handler folds. The source is part of the stream's digest, so it is built in one place.
2. **Its questions**: the PARTS of its state, which part each entity's move invalidates, and a `read(execute, parts, {account, at, into})` that asks some parts as of one block and writes them into a copy of the state (see `./follower.ts`, `StateFollowerSpec`). If it folds the base's `CycleAdvanced`, an offline world (Manual policy) is stamped from it.
3. **Two worker entries**, about ten lines each, because the bundler has to see the processor's import and a literal `new Worker(new URL(...))` in the game's code:

```ts
// indexer.worker.ts (a live chain)
import {hostLiveIndexer} from '$lib/indexer/host';
import {myProcessor} from './processor';
hostLiveIndexer({
	processor: myProcessor,
	databasePrefix: 'mygame',
	finality: 12,
});

// indexer.world.worker.ts (an offline world)
import {hostWorldIndexer} from '$lib/indexer/host';
import {myProcessor} from './processor';
hostWorldIndexer({processor: myProcessor});
```

4. **The board**, handed to `createCommitRevealGame` as `board` in place of `poll`:

```ts
board: () =>
	createIndexedState({
		provider: core.connection.provider,
		publicClient: core.publicClient,
		cycle: config.cycle,
		worker: indexerWorkerFor('mygame', deployments, gameAddress),
		startWorker: (worker) =>
			worker.kind === 'world'
				? new Worker(new URL('./indexer.world.worker.ts', import.meta.url), {type: 'module', name: worker.name})
				: new Worker(new URL('./indexer.worker.ts', import.meta.url), {type: 'module', name: worker.name}),
		source: indexingSource(deployments),
		finality: 12,
		follower: myFollower,
		cycleOf: (data) => data.advancedCycle,
		present: (data, cycleNumber) => ({...data, cycleNumber}),
	}),
```

The reference game on this node is the worked example: `$lib/placement/indexer/` (processor, source, questions, the two entries, `board.ts`), with `test/lib/placement/indexer.test.ts` holding the fold to the contract's storage.

## What the framework does

- **`./host.ts`**: the two worker bodies. A live chain's: ONE TAB INDEXES and the others read (etherfold ADR-0097) under an election named per deployment, a database per stream, a published snapshot installed when the tab names a publication (the processor may then be the PUBLISHED BUNDLE, whose bytes are its identity: `processorBundle: {url: new URL('processor.bundle.js', appRoot())}`). An offline world's: no election, no publication, its database named by the world and kept across reloads.
- **`./worker-choice.ts`**: which worker a deployment runs and its name (`<prefix>-<chainId>-<game>` for a live chain, `<prefix>-world-<chainId>` for a world), and `deleteWorldIndex` for a forgotten world.
- **`./indexed-state.ts`**: the `OnchainStateStore` the skeleton reads: the port to the worker, the follower, the worker's progress, the refusal and failure statuses, and the CYCLE STAMP (`./cycle-stamp.ts`: the block's timestamp under the timed policy, the game's folded `CycleAdvanced` under Manual, hybrid refused).
- **`./follower.ts`**: one full read, then only the parts whose entities moved, pinned by block HASH so a reorg between the signal and the read is refused and read again rather than composed, serialised so an older answer never lands after a newer one.
- **`contracts/utils/indexer.ts`**: `indexInProcess`, the same processor in Node over SQLite, for contracts tests, unit tests and scripts.

## What stays the game's

The processor and its entities, the source's contract list, the questions, the two worker entries, the database prefix, and a snapshot job if it publishes one (`etherfold build --publish`, with the bundle the live worker then fetches). stratagems is the first game that does all of it, including the publication.

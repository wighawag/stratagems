/**
 * THE WORKER ENTRY FOR AN OFFLINE WORLD: the stratagems indexer folding the chain
 * that lives in this tab (`$lib/embedded`), chosen by `./worker-choice.ts`.
 *
 * It differs from `./indexer.worker.ts` in three ways, each because a world is a
 * chain nobody else can see (step O, P8, of
 * work/plans/join-template-commit-reveal.md):
 *
 * - NO TAB ELECTION: no other tab can read this tab's chain, so there is nobody
 *   to elect, and a world in an election would contend with the online tabs.
 * - NO PUBLICATION: nobody publishes a snapshot of a world, so the processor is
 *   imported as a module rather than fetched as the published bundle, whose
 *   bytes are its identity only for finding a snapshot.
 * - ITS DATABASE IS THE WORLD'S, named by this worker's own name (the world's
 *   minted chain id, which the tab gives it) and the stream, and kept across
 *   reloads. That is not a fourth store that can disagree with the restored
 *   chain: webevm saves its dump after every mined block and awaits the save
 *   before the request returns, so the index never holds a block the saved chain
 *   lacks; after a reload it is at most behind, and folds forward. An incoherent
 *   restore mints a new chain id, which is a new database. Forgetting a world
 *   deletes its databases (`deleteWorldIndex`).
 */
import {
	createBrowserStateStore,
	hostIndexerInThisWorker,
} from '@etherfold/browser';
import {graphqlQueryHandler} from '@etherfold/graphql/worker';
import {
	EntityEventProcessor,
	openForWriting,
} from '@etherfold/processor-entities';
import {stratagemsProcessor} from 'stratagems-indexer';

/** Given by the tab (`new Worker(url, {name})`): `stratagems-world-<chainId>`. */
const worldName = self.name;
if (!worldName) {
	throw new Error(
		`the offline world's indexer worker was started without the world's name`,
	);
}

hostIndexerInThisWorker({
	createState: async (context, {signal}) =>
		openForWriting(
			await createBrowserStateStore(stratagemsProcessor.entities, {
				databaseName: `${worldName}-${context.stream}`,
			}),
			{signal},
		),
	createProcessor: (state) =>
		new EntityEventProcessor(state as never, stratagemsProcessor),
	// GraphQL, answered here where the store is, as in the online worker.
	query: graphqlQueryHandler(),
});

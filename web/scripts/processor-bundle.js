// Copy the processor BUNDLE the snapshot job folds with into static/, where the
// indexer worker fetches it (src/lib/stratagems/state/indexer.worker.ts).
//
// Copied, never rebuilt: a published snapshot is keyed by the SHA-256 of the
// bundle's bytes (etherfold ADR-0086, ADR-0095), so the tab has to run exactly the
// file `pnpm indexer:index` ran. `pnpm indexer:build <mode>` produces it.
import {copyFileSync, existsSync} from 'node:fs';

const from = new URL('../../indexer/dist/processor.bundle.js', import.meta.url);
const to = new URL('../static/processor.bundle.js', import.meta.url);

if (!existsSync(from)) {
	console.error(`${from.pathname} does not exist: build the indexer first (pnpm indexer:build <mode>)`);
	process.exit(1);
}
copyFileSync(from, to);
console.log(`processor bundle copied to ${to.pathname}`);

/**
 * `pnpm index --mode <mode> [-n <node url>]`: fold a deployment and publish it.
 *
 * This is what `pnpm indexer:index <mode>` (the interface the separate
 * `stratagems-snapshots` repository calls) ends in. It runs ONE command:
 *
 *   etherfold build -p dist/processor.bundle.js --store sqlite --db file:data/<mode>.db
 *                   --publish ../web/static/indexed-states/<mode> --history none
 *
 * with the source and the finality in the environment (`INDEXING_SOURCE`,
 * `STREAM_FINALITY`), both built by `src/source.ts`, the same module the web app
 * builds its own from: a tab finds the snapshot only when its stream digest (source
 * plus stream config) and its processor (the bundle's SHA-256) are the job's.
 *
 * - `build` folds to the tip, resuming from `data/<mode>.db` when it exists (the
 *   cursor is in the store), and exits; `--publish` then writes the canonical
 *   generation's state snapshot, cut at `tip - finality`, and the publication index
 *   (`publication.json`) into the directory. History `none` (the live rows only)
 *   and NO `--seed`: the web app runs in etherfold's snapshot-only mode.
 * - The directory is never pruned by etherfold: every publication adds a
 *   content-addressed body and replaces only its own generation's entry in the
 *   index, so an old build of the app still finds the snapshot of its own processor.
 */
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {indexingSource, STREAM_FINALITY} from '../src/source.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function argument(names: string[]): string | undefined {
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		if (names.includes(args[i])) return args[i + 1];
	}
	return undefined;
}

const mode = argument(['--mode', '-m']);
if (!mode) {
	console.error('usage: pnpm index --mode <mode> [-n <node url>]');
	process.exit(1);
}
const nodeUrl = argument(['-n', '--node-url']) || process.env.ETH_NODE_URI;
if (!nodeUrl) {
	console.error(`no node to read the chain through: pass -n <url>, or set ETH_NODE_URI_${mode} or ETH_NODE_URI`);
	process.exit(1);
}

const bundle = resolve(root, 'dist/processor.bundle.js');
if (!existsSync(bundle)) {
	console.error(`${bundle} does not exist: run \`pnpm build\` in indexer/ first (pnpm indexer:build <mode> does)`);
	process.exit(1);
}

const {default: contracts} = await import('../src/contracts.js');
if (contracts.name !== mode) {
	console.error(`src/contracts.ts was exported for "${contracts.name}", not "${mode}": run pnpm indexer:build ${mode}`);
	process.exit(1);
}

const dataDir = resolve(root, 'data');
mkdirSync(dataDir, {recursive: true});
const db = `file:${resolve(dataDir, `${mode}.db`)}`;
const publishDir = resolve(root, '../web/static/indexed-states', mode);

const args = [
	'build',
	'-p',
	bundle,
	'--store',
	'sqlite',
	'--db',
	db,
	'-n',
	nodeUrl,
	'--indexer',
	'stratagems',
	'--publish',
	publishDir,
	'--history',
	'none',
	// the configuration is the truth for a one-shot job: a pending successor a
	// previous run left in data/<mode>.db (another bundle) is replaced, not asked about
	'--override',
];

console.log(`etherfold ${args.map((arg) => (arg === nodeUrl ? '<node url>' : arg)).join(' ')}`);

const child = spawn(resolve(root, 'node_modules/.bin/etherfold'), args, {
	stdio: 'inherit',
	env: {
		...process.env,
		INDEXING_SOURCE: JSON.stringify(indexingSource(contracts)),
		STREAM_FINALITY: String(STREAM_FINALITY),
	},
});
child.on('exit', (code, signal) => {
	process.exit(code ?? (signal ? 1 : 0));
});

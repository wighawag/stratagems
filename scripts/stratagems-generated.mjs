#!/usr/bin/env node
/**
 * Give a fresh clone of stratagems the generated files `pnpm --filter ./web check`
 * needs, from the COMMITTED alpha1 records, so the node's verify
 * (`pnpm install && pnpm --filter ./web check && pnpm --filter ./web run test:unit`)
 * passes in a worktree nobody has bootstrapped by hand.
 *
 * STRATAGEMS' OWN, not the template's: `scripts/ensure-deployments.mjs` (which
 * runs right after this, from the root `prepare`) does the same job for the
 * framework's `web/src/lib/deployments.ts` only. stratagems' app needs more than
 * that, all of it gitignored, and without it `check` reports about 30 errors
 * that name none of these files:
 *
 * - `web/src/data/contracts.ts` and `indexer/src/contracts.ts`, exported from
 *   the deployment records (`pnpm contracts:export <mode>`);
 * - `common/dist` and `indexer/dist`, the two workspace packages the web app
 *   imports as `stratagems-common` and `stratagems-indexer`.
 *
 * `pnpm indexer:build alpha1` makes all of them, and it also writes
 * `web/src/lib/deployments.ts` (the root `contracts:export` names it), so the
 * framework is typed against the SAME chain as the app, and ensure-deployments
 * then finds the file and leaves it alone. Without this it would export whichever
 * network `readdir` returned first, and the framework would be typed against a
 * different deployment from stratagems' own code.
 *
 * WHAT IT DOES NOT DO: overwrite anything. A developer who has exported their own
 * chain (`pnpm start`, `pnpm contracts:export localhost`) keeps it. It only runs
 * when one of the files is missing, which on a developer's tree is never.
 *
 * It never fails the install, for the same reason ensure-deployments does not:
 * it says what is missing and how to make it.
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MODE = 'alpha1';

const needed = [
	'web/src/data/contracts.ts',
	'web/src/lib/deployments.ts',
	'indexer/src/contracts.ts',
	'common/dist',
	'indexer/dist',
];
const missing = needed.filter((path) => !existsSync(join(root, path)));
if (missing.length === 0) process.exit(0);

const exported = ['web/src/data/contracts.ts', 'indexer/src/contracts.ts'].every((path) =>
	existsSync(join(root, path)),
);

try {
	if (exported) {
		// The developer's own export stays; only the builds are missing. The
		// framework's file is the same export of the same chain, so it is a copy.
		if (!existsSync(join(root, 'web/src/lib/deployments.ts'))) {
			copyFileSync(join(root, 'web/src/data/contracts.ts'), join(root, 'web/src/lib/deployments.ts'));
		}
		if (!existsSync(join(root, 'common/dist')) || !existsSync(join(root, 'indexer/dist'))) {
			execFileSync('pnpm', ['--filter', './common', 'build'], {cwd: root, stdio: 'pipe'});
			execFileSync('pnpm', ['--filter', './indexer', 'build'], {cwd: root, stdio: 'pipe'});
		}
	} else {
		execFileSync('pnpm', ['indexer:build', MODE], {cwd: root, stdio: 'pipe', timeout: 5 * 60 * 1000});
	}
	const source = exported ? 'from the existing export' : `from the committed ${MODE} records`;
	console.log(`[stratagems-generated] Generated ${missing.join(', ')} (${source}).`);
} catch (e) {
	console.warn(
		`[stratagems-generated] Could not generate ${missing.join(', ')}: ${e instanceof Error ? e.message : e}\n` +
			`  Run \`pnpm indexer:build ${MODE}\` (or your own mode) before \`pnpm --filter ./web check\`.`,
	);
}

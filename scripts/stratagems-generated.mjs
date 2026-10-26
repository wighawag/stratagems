#!/usr/bin/env node
/**
 * Generate what stratagems' workspaces type-check and test against, on a fresh
 * clone or worktree, before anything is deployed: the root `prepare` runs this
 * before the template's `ensure-deployments.mjs`.
 *
 *   web/src/lib/deployments.ts, indexer/src/contracts.ts,
 *   helper-services/fuzd/contracts.json   (the export of the game's contracts)
 *   common/dist, indexer/dist             (built from those)
 *
 * FROM A THROWAWAY DEPLOY OF THE CURRENT CONTRACTS (step 10b, 2026-10-25). Until
 * then this exported alpha1's committed records; the game is rebuilt on the
 * commit-reveal base as a new deployment, and alpha1's ABI is not the one the code
 * is written against any more. So it deploys the contracts to a chain that exists
 * only for this process (`contracts/scripts/deploy-ephemeral.ts`, environment
 * `ephemeral`), exports that, and throws the records away. Addresses are on no
 * chain. Deploying for real (`pnpm contracts:deploy <mode>`) overwrites all four.
 *
 * It does nothing when everything is already there, so a developer's own export
 * is never replaced; and once it has written `web/src/lib/deployments.ts`,
 * `ensure-deployments.mjs` finds it and does nothing either (it would otherwise
 * export the first committed records it finds, which are alpha1's, kept as history).
 */
import {execFileSync} from 'node:child_process';
import {existsSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const EPHEMERAL = 'ephemeral';
const EXPORTED = [
	'web/src/lib/deployments.ts',
	'indexer/src/contracts.ts',
	'helper-services/fuzd/contracts.json',
];
const BUILT = ['common/dist', 'indexer/dist'];

const missing = [...EXPORTED, ...BUILT].filter((path) => !existsSync(join(root, path)));
if (missing.length === 0) process.exit(0);

const run = (args, timeout = 5 * 60 * 1000) => execFileSync('pnpm', args, {cwd: root, stdio: 'pipe', timeout});

try {
	if (EXPORTED.some((path) => !existsSync(join(root, path)))) {
		const ephemeralDir = join(root, 'contracts/deployments', EPHEMERAL);
		try {
			rmSync(ephemeralDir, {recursive: true, force: true});
			// a compile on a fresh clone, then a few transactions on an instant chain
			run(['--filter', './contracts', 'exec', 'hardhat', 'run', 'scripts/deploy-ephemeral.ts'], 10 * 60 * 1000);
			run([
				'--filter',
				'./contracts',
				'export',
				'-e',
				EPHEMERAL,
				'--json',
				'../helper-services/fuzd/contracts.json',
				'--ts',
				'../indexer/src/contracts.ts,../web/src/lib/deployments.ts',
			]);
		} finally {
			rmSync(ephemeralDir, {recursive: true, force: true});
		}
	}
	run(['--filter', './common', 'build']);
	run(['--filter', './indexer', 'build']);
	console.log(`[stratagems-generated] Generated ${missing.join(', ')} (from a throwaway deploy of the contracts).`);
} catch (e) {
	console.warn(
		`[stratagems-generated] Could not generate ${missing.join(', ')}: ${e instanceof Error ? e.message : e}\n` +
			`  Run \`pnpm --filter ./contracts exec hardhat run scripts/deploy-ephemeral.ts\` and the export by hand, ` +
			`or deploy to your own mode, before \`pnpm --filter ./web check\`.`,
	);
}

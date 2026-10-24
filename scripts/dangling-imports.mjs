/**
 * EVERY IMPORT IN THIS REPO NAMES A FILE THAT EXISTS.
 *
 * WHY THIS EXISTS, AND IT IS A MEASUREMENT RATHER THAN A PRECAUTION. Two
 * consecutive cascades out of this template broke `reveal-or-die`, and both
 * times the thing that broke it was a hunk that merged CLEANLY, which is the
 * one thing a merge review does not look at:
 *
 *  - 2026-09-09: this template DELETED `game/render/pixi/PixiCanvas.svelte`,
 *    the deletion applied without complaint, and that repo's own
 *    `world/render/index.ts` went on importing it. Three conflicts were
 *    reported and correctly resolved; the build was broken by the part that had
 *    no conflict.
 *  - 2026-09-23: five files arrived as clean ADDS carrying nine imports of
 *    `$lib/placement`, which is THIS repo's game and a directory that one had
 *    deleted wholesale years of commits ago.
 *
 * Both are the same defect in two directions - a deletion that strands an
 * import, and an import that arrives naming something already deleted - and
 * neither of them is visible in `git status` after a merge, because git has
 * nothing to say about either.
 *
 * IT LIVES HERE, AT THE TEMPLATE, BECAUSE THE DEFECT IS THE TREE'S AND NOT ONE
 * REPO'S. Every game built from this template deletes `web/src/lib/placement`
 * and writes its own, so every one of them is one clean hunk away from holding
 * an import of a directory it does not have; and every deletion made here
 * arrives in all of them at once. A check that only the repo that got burnt
 * carries is a check the next repo has to get burnt to acquire.
 *
 * WHAT IT ADDS OVER `check` AND `test:unit`, which is a fair question because
 * both of those would have caught all seven files. It is not coverage, it is
 * WHEN AND HOW CHEAPLY. `offshoot-fanout --verify` runs the full verify and
 * catches this one step AFTER the mistake; the HAND path (the fanout stops at
 * the conflicts, a human resolves four routine-looking ones and moves on)
 * skips verify entirely, and with only four conflicts the temptation to skip it
 * is higher than it was at forty. This is a walk of the tree with no install,
 * no `svelte-kit sync` and no compile, so it can be run in the middle of a
 * conflicted merge, in about a second, before anything expensive:
 *
 *     node scripts/check-dangling-imports.mjs
 *
 * It is ALSO wired into `test:unit` (`web/test/dangling-imports.test.ts`), so
 * the tool path gets it too and there is one implementation rather than two.
 *
 * WHERE IT REALLY BELONGS is `offshoot-fanout`, as a post-merge step: this
 * failure is not specific to this tree or to renderers, and every level
 * boundary that moves a file between branches has it. It is in the repo rather
 * than in the tool because `offshoot-fanout` on this host is a nix-store binary
 * (0.6.0) with no source checkout to edit, so the generic version is a
 * different change in a different repo.
 *
 * IT READS IMPORTS WITH THE TYPESCRIPT PARSER, NOT WITH A REGEX, and that was
 * not the first draft. A regex over `from '...'` reports every string that
 * merely LOOKS like an import, and this tree is full of them on purpose: the
 * boundary tests under `web/test` carry import statements as DATA, because
 * asserting about who may import `$app/*` means writing `$app/*` down. The
 * first draft reported nine dangling imports of which seven were those strings
 * and a sentence in a comment. A checker whose output is mostly noise is a
 * checker that gets skipped, which is precisely the failure it exists to stop.
 * `ts.preProcessFile` is the compiler's own scanner for exactly this question -
 * static imports, `export ... from`, dynamic `import()`, `require()` - and it
 * knows a string literal from a module specifier.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is resolve bare specifiers. `viem`,
 * `svelte/store` and friends are package resolution, which is `pnpm install`'s
 * job and is already checked by everything downstream; asking about them here
 * would mean reproducing node's resolution algorithm in order to re-answer a
 * question nothing gets wrong. What a cascade breaks is PATHS INSIDE THE REPO,
 * and those are exactly what this resolves.
 */
import {createRequire} from 'node:module';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/**
 * TYPED WITH JSDOC, because `web/tsconfig.json` sets `checkJs` and the test
 * below imports this. A `@ts-nocheck` would have been one line and would have
 * meant the only untyped file in the repo is the one asserting about the
 * repo's own module graph.
 *
 * @typedef {{fileName: string}} ImportedFile
 * @typedef {{preProcessFile: (text: string, readImportFiles: boolean, detectJavaScriptImports: boolean) => {importedFiles: readonly ImportedFile[]}}} Scanner
 * @typedef {{file: string, specifier: string}} DanglingImport
 */

/**
 * TypeScript from `web/`, which is where this monorepo installs it.
 *
 * NOT OPTIONAL, AND IT THROWS RATHER THAN DEGRADING. A checker that quietly
 * falls back to something weaker when a dependency is missing is a checker that
 * reports success for the wrong reason, which is the exact species of failure
 * this file is about. If typescript is not there, say so and stop.
 *
 * @returns {Scanner}
 */
function typescript() {
	try {
		return createRequire(join(REPO, 'web/package.json'))('typescript');
	} catch (err) {
		throw new Error(
			'the dangling-import check needs typescript from web/node_modules ' +
				'(run `pnpm i`). It reads imports with the compiler scanner rather ' +
				'than a regex, deliberately - see this module.',
			{cause: err},
		);
	}
}

/** Directories walked, relative to the repo root. */
const ROOTS = ['web/src', 'web/test', 'web/e2e'];

/** Files whose imports are read. */
const SOURCE = new Set(['.ts', '.js', '.mjs', '.svelte']);

const SKIP_DIRS = new Set([
	'node_modules',
	'.git',
	'.svelte-kit',
	'build',
	'dist',
	'generated',
	'test-results',
	'playwright-report',
]);

/**
 * What a specifier may be spelled as on disk.
 *
 * ORDER MATTERS ONLY FOR SPEED, not for correctness: this asks whether ANY of
 * them exists, so it is a question about presence rather than about which one a
 * bundler would pick. Getting the bundler's precedence wrong would matter to a
 * build and does not matter to "is there a file here at all", which is the only
 * thing being asked.
 */
const CANDIDATES = [
	'',
	'.ts',
	'.js',
	'.svelte',
	'.svelte.ts',
	'.json',
	'.mjs',
	'/index.ts',
	'/index.js',
	'/index.svelte',
];

/**
 * @param {string} dir
 * @param {string[]} found
 * @returns {string[]}
 */
function walk(dir, found) {
	let entries;
	try {
		entries = readdirSync(dir, {withFileTypes: true});
	} catch {
		// A root this repo does not have is not a failure: `web/e2e` is absent in
		// some siblings, and a checker that demanded it would be asserting about
		// somebody else's layout.
		return found;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			walk(path, found);
			continue;
		}
		const dot = entry.name.lastIndexOf('.');
		if (dot < 0) continue;
		if (SOURCE.has(entry.name.slice(dot))) found.push(path);
	}
	return found;
}

/**
 * The typescript the compiler scanner should look at, for one file.
 *
 * A `.svelte` file is not TypeScript, so its `<script>` blocks are lifted out
 * and scanned as though they were. Everything between them is markup, and the
 * only module specifiers a component has are in its script - `{@const}` and the
 * template cannot import.
 *
 * @param {string} file
 * @param {string} text
 * @returns {string[]}
 */
function scriptsIn(file, text) {
	if (!file.endsWith('.svelte')) return [text];
	/** @type {string[]} */
	const blocks = [];
	const tag = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
	let match;
	while ((match = tag.exec(text)) !== null) blocks.push(match[1]);
	return blocks;
}

/**
 * Turn a specifier into an absolute path this repo should hold, or `undefined`
 * if it is not this repo's to answer for.
 *
 * @param {string} specifier
 * @param {string} file
 * @param {string} root
 * @returns {string | undefined}
 */
function targetOf(specifier, file, root) {
	// `./$types` is SvelteKit's per-route generated types, which live in
	// `.svelte-kit/types` under a parallel tree and are produced by
	// `svelte-kit sync`. Resolving it would mean either running sync (which this
	// check exists to avoid needing) or reproducing that mapping.
	if (specifier.endsWith('$types')) return undefined;
	if (specifier.startsWith('$lib/') || specifier === '$lib') {
		return resolve(root, 'web/src/lib', specifier.slice('$lib'.length + 1));
	}
	// `$app/*`, `$env/*` and `$service-worker` are SvelteKit's own virtual
	// modules with no file behind them, and the framework boundary test is what
	// polices who may import them.
	if (specifier.startsWith('$')) return undefined;
	if (specifier.startsWith('.')) return resolve(dirname(file), specifier);
	// Bare, so it is a package. See the note on this module.
	return undefined;
}

/**
 * @param {string} target
 * @returns {boolean}
 */
function exists(target) {
	for (const suffix of CANDIDATES) {
		const candidate = target + suffix;
		if (!existsSync(candidate)) continue;
		// A directory alone is not a module: `$lib/placement` with no `index.ts`
		// is exactly the shape a deleted barrel leaves behind.
		if (suffix === '' && statSync(candidate).isDirectory()) continue;
		return true;
	}
	// `./foo.js` meaning `./foo.ts` is ordinary in a TypeScript source tree, so
	// ask that question too rather than reporting a file that is plainly there.
	if (target.endsWith('.js')) {
		const asTs = target.slice(0, -3) + '.ts';
		if (existsSync(asTs)) return true;
	}
	return false;
}

/**
 * Every import in the tree that names a path this repo does not have.
 *
 * Returns `{file, specifier}` pairs with repo-relative file paths, in the order
 * they are found, so the output is stable enough to paste into a commit message
 * or diff between two runs.
 *
 * @param {{root?: string, ts?: Scanner}} [params]
 * @returns {DanglingImport[]}
 */
export function findDanglingImports(params = {}) {
	const ts = params.ts ?? typescript();
	const root = params.root ?? REPO;
	/** @type {DanglingImport[]} */
	const dangling = [];
	for (const rootDir of ROOTS) {
		for (const file of walk(join(root, rootDir), []).sort()) {
			const text = readFileSync(file, 'utf8');
			for (const script of scriptsIn(file, text)) {
				// `readImportFiles`, and `detectJavaScriptImports` for the `require()`
				// and bare `import()` forms a `.js` file may use.
				const found = ts.preProcessFile(script, true, true);
				for (const {fileName: specifier} of found.importedFiles) {
					const target = targetOf(specifier, file, root);
					if (target === undefined) continue;
					if (exists(target)) continue;
					dangling.push({file: relative(root, file), specifier});
				}
			}
		}
	}
	return dangling;
}

#!/usr/bin/env node
/**
 * RUN THIS THE MOMENT A MERGE IS RESOLVED, BEFORE ANYTHING EXPENSIVE.
 *
 *     node scripts/check-dangling-imports.mjs
 *
 * It is the hand path's half of `scripts/dangling-imports.mjs` - read that file
 * for why this exists and what it deliberately does not check. The short
 * version: two cascades out of this template have been broken by a hunk that
 * merged cleanly, so `git status` after the merge said nothing was wrong, and
 * `--verify` would have caught it one step later than the mistake. This runs
 * in about a second with no install and no compile, so it can be run inside a
 * conflicted merge.
 *
 * Exits non-zero with the list, so it can also be a git hook or a CI step.
 */
import {findDanglingImports} from './dangling-imports.mjs';

const dangling = findDanglingImports();

if (dangling.length === 0) {
	console.log('✓ every import names a path that exists');
	process.exit(0);
}

console.error(
	`✗ ${dangling.length} import${dangling.length === 1 ? '' : 's'} name a path this repo does not have:\n`,
);
for (const {file, specifier} of dangling) {
	console.error(`  ${file}\n      ${specifier}`);
}
console.error(
	`\nAfter a cascade this usually means one of two things, and they are the same\n` +
		`defect from opposite sides:\n\n` +
		`  - the merge DELETED something this repo still imports, or\n` +
		`  - a file ARRIVED importing something this repo deleted long ago\n\n` +
		`A GAME DIRECTORY is the usual one, because contracts and the game on top of\n` +
		`them are not inherited in this tree: every repo replaces its parent's game\n` +
		`wholesale, so an import of the parent's arriving in the child names a\n` +
		`directory that was deleted years of commits ago. Ask what this repo's own\n` +
		`game is called before concluding the import is wrong rather than the path.\n\n` +
		`Neither shows up as a conflict, which is why this check exists.\n`,
);
process.exit(1);

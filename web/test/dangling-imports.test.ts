import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it, expect} from 'vitest';
// A plain .mjs helper at the repo ROOT, deliberately: it has to run under bare
// `node` in the middle of a conflicted merge, before `svelte-kit sync` or a
// reinstall have been near the tree. It is JSDoc-typed rather than suppressed,
// so this import needs nothing special. See the module for why that matters.
import {findDanglingImports} from '../../scripts/dangling-imports.mjs';

/**
 * No import in this repo names a path that is not here.
 *
 * THE TOOL PATH'S HALF of `scripts/check-dangling-imports.mjs`, sharing its one
 * implementation. The reasoning, and the two cascades that paid for it, are on
 * `scripts/dangling-imports.mjs`; what this adds is that `test:unit` is in
 * every repo's configured verify, so `offshoot-fanout --verify` asks the
 * question too rather than only a human who remembered to.
 *
 * IT IS NOT REDUNDANT WITH `check`, though it overlaps. `svelte-check` answers
 * this for `web/src` and it is the slowest thing in the suite; this also covers
 * `web/test` and `web/e2e`, and above all it can be run without installing or
 * syncing anything, which is what makes it usable at the moment the mistake is
 * actually made rather than one step after it.
 */
describe('every import names a path that exists', () => {
	it('finds nothing dangling under web/src, web/test and web/e2e', () => {
		const dangling = findDanglingImports();
		expect(
			dangling.map(({file, specifier}) => `${file} -> ${specifier}`),
			'these imports name paths this repo does not have. After a cascade ' +
				'that is either a deletion that stranded an import, or a file that ' +
				'arrived importing something this repo deleted - a GAME directory ' +
				'most often, since every repo in this tree replaces its parent\u2019s ' +
				'game wholesale. Neither is a conflict, which is why this is checked ' +
				'rather than reviewed',
		).toEqual([]);
	});

	it('has teeth: both shapes of the cascade defect are reported', () => {
		// GUARDS THE GUARD, and this tree has already been broken twice by a check
		// that was one step away from the mistake. The assertion above is vacuously
		// true the moment the walk stops finding files - a renamed root, a skip
		// list that grew one entry too far - and it would stay green forever while
		// checking nothing.
		//
		// A TEMPORARY TREE rather than a committed fixture, because a fixture would
		// have to live under one of the directories this same check walks, so a
		// file that is dangling ON PURPOSE would be reported by the assertion
		// above. The two would then have to be taught about each other, and the
		// exclusion is exactly the kind of hole this is guarding. It is also what
		// lets the specifiers below name paths without asserting anything about
		// which of them this particular repo happens to have.
		const root = mkdtempSync(join(tmpdir(), 'dangling-imports-'));
		try {
			mkdirSync(join(root, 'web/src/thing'), {recursive: true});
			writeFileSync(
				join(root, 'web/src/thing/here.ts'),
				'export const a = 1;\n',
			);
			// The 2026-09-23 shape: a file ARRIVES naming the parent's game, which
			// this repo replaced. Spelled as a game no repo in this tree has, so the
			// fixture is about the SHAPE rather than about whose game is whose.
			writeFileSync(
				join(root, 'web/src/arrived.ts'),
				"import {x} from '$lib/a-game-this-repo-replaced/commit-reveal';\nexport const b = x;\n",
			);
			// The 2026-09-09 shape: a DYNAMIC import of something the merge deleted,
			// beside a static one that is fine, so this also asserts it does not
			// simply report everything.
			writeFileSync(
				join(root, 'web/src/stranded.ts'),
				"import {a} from './thing/here';\n" +
					"export const load = () => import('$lib/game/render/pixi/PixiCanvas.svelte');\n" +
					'export const c = a;\n',
			);
			const dangling = findDanglingImports({root});
			expect(dangling.map((d) => d.specifier)).toEqual([
				'$lib/a-game-this-repo-replaced/commit-reveal',
				'$lib/game/render/pixi/PixiCanvas.svelte',
			]);
		} finally {
			rmSync(root, {recursive: true, force: true});
		}
	});
});

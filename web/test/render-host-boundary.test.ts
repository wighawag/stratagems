import {describe, it, expect} from 'vitest';
import {existsSync, readFileSync} from 'node:fs';

/**
 * SWAPPING THE RENDERER MUST COST ONE FILE.
 *
 * The module the play page loads its canvas from (`loadCanvasComponent`,
 * `$lib/placement/render/index.ts` in this template) names which canvas host
 * this game mounts,
 * and D11 makes that choice a BRANCH axis: `main` carries the immediate
 * canvas-2d host and no rendering library, and `with/pixi-js` carries pixi. The
 * branch is only affordable if it edits that one shared file, because every
 * other shared file it touches is a conflict site that `main` keeps developing
 * (rule N1 in the plan, `work:work/specs/proposed/games-on-this-foundation.md`).
 *
 * The file most at risk is `routes/play/+page.svelte`. It mounts whichever host
 * `index.ts` names and passes it a fixed set of props, two of which - `cellSize`
 * and `gridCells` - only a scene-graph host has any use for. The canvas-2d host
 * therefore ACCEPTS AND IGNORES them, and says so in a comment on each.
 *
 * That looks like dead code and it is not: it is what keeps the page identical
 * on both nodes. Delete the unused props as a tidy-up and the page has to
 * change on the branch too, which doubles the branch's shared-file budget and
 * puts a permanent conflict into a route both nodes keep editing. The tidy-up
 * is also the kind of change that passes every other test in the tree, which is
 * why the rule is written as a test rather than as a comment.
 *
 * This is a SOURCE check rather than a runtime one on purpose. Svelte 5 does
 * not throw on an undeclared prop, so the failure it guards against is silent
 * at runtime: the host simply ignores something the page meant it to have.
 *
 * THE SELECTOR IS FOUND THROUGH THE PAGE, not named here. Every game replaces
 * `$lib/placement` with its own game and keeps its selector wherever its game
 * lives (`$lib/world/render` in reveal-or-die, a file of stratagems' own), so a
 * hard-coded path made every game either edit this file or omit it. Following
 * the page's `import {loadCanvasComponent} from '$lib/...'` keeps the file
 * byte-identical in all of them, and it is the page's import that decides
 * which host mounts anyway.
 */

const root = new URL('..', import.meta.url).pathname;
const PAGE = 'src/routes/play/+page.svelte';

/**
 * The module the page imports `loadCanvasComponent` from, as a path under the
 * web root: `$lib/a/b` resolves to `src/lib/a/b.ts` or `src/lib/a/b/index.ts`,
 * the two shapes SvelteKit's `$lib` alias takes.
 */
function selectorPath(
	pageSource: string,
	exists: (path: string) => boolean,
): string {
	const found = pageSource.match(
		/import\s*\{[^}]*\bloadCanvasComponent\b[^}]*\}\s*from\s*'\$lib\/([^']+)'/,
	);
	expect(
		found,
		`${PAGE} no longer imports loadCanvasComponent from $lib; this test needs updating with it`,
	).not.toBeNull();
	const base = `src/lib/${found![1].replace(/\.(ts|js)$/, '')}`;
	const candidates = [`${base}.ts`, `${base}/index.ts`];
	const path = candidates.find(exists);
	expect(
		path,
		`${PAGE} loads its canvas from $lib/${found![1]}, but none of ${candidates.join(', ')} exists`,
	).toBeDefined();
	return path!;
}

function selector(): string {
	return selectorPath(readFileSync(`${root}${PAGE}`, 'utf8'), (path) =>
		existsSync(`${root}${path}`),
	);
}

/** The props `+page.svelte` hands to `<GameCanvas ... />`. */
function propsPassedByThePage(): string[] {
	const source = readFileSync(`${root}${PAGE}`, 'utf8');
	const tag = source.match(/<GameCanvas\b([\s\S]*?)\/>/);
	expect(
		tag,
		`${PAGE} no longer mounts <GameCanvas .../>; this test needs updating with it`,
	).not.toBeNull();
	return [...tag![1].matchAll(/(?:^|\s)([a-zA-Z][a-zA-Z0-9]*)=\{/g)].map(
		(m) => m[1],
	);
}

/** The host component `index.ts` says to load. */
function hostPath(): string {
	const at = selector();
	const source = readFileSync(`${root}${at}`, 'utf8');
	const found = source.match(/import\('\$lib\/(.*?\.svelte)'\)/);
	expect(
		found,
		`${at} no longer names a canvas component to load`,
	).not.toBeNull();
	return `src/lib/${found![1]}`;
}

/** The prop names declared in that component's `interface Props`. */
function propsDeclaredBy(path: string): string[] {
	const source = readFileSync(`${root}${path}`, 'utf8');
	const block = source.match(/interface Props \{([\s\S]*?)\n\t\}/);
	expect(
		block,
		`${path} has no 'interface Props' block to read`,
	).not.toBeNull();
	return [...block![1].matchAll(/^\t\t([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map(
		(m) => m[1],
	);
}

describe('the render host boundary', () => {
	it('declares every prop the play page passes it', () => {
		const passed = propsPassedByThePage();
		// Guards the guard: a regex that silently matched nothing would make
		// every assertion below vacuously true, which is the failure mode of a
		// source-level check.
		expect(passed.length).toBeGreaterThanOrEqual(5);

		const host = hostPath();
		const declared = propsDeclaredBy(host);
		const missing = passed.filter((prop) => !declared.includes(prop));
		expect(
			missing,
			`${host} ignores ${missing.join(', ')}, which ${PAGE} passes. ` +
				`Either the host should accept it (even to ignore it, as the ` +
				`canvas-2d host does with cellSize and gridCells) or the page ` +
				`should stop passing it - but the page is shared with with/pixi-js, ` +
				`so changing it there is a conflict site forever.`,
		).toEqual([]);
	});

	/**
	 * Named explicitly, because the general rule above would still pass if the
	 * page ALSO stopped passing them. These two are the ones a scene-graph host
	 * needs and this one does not, so they are exactly the pair a well-meaning
	 * cleanup removes from both sides at once.
	 */
	it('keeps the two props only a scene-graph host uses', () => {
		const passed = propsPassedByThePage();
		expect(passed).toContain('cellSize');
		expect(passed).toContain('gridCells');
		expect(propsDeclaredBy(hostPath())).toEqual(
			expect.arrayContaining(['cellSize', 'gridCells']),
		);
	});
});

describe('finding the selector through the page', () => {
	const page = (from: string) =>
		`<script lang="ts">\n\timport {loadCanvasComponent} from '${from}';\n</script>`;

	it('resolves a directory module to its index', () => {
		const exists = (path: string) => path === 'src/lib/world/render/index.ts';
		expect(selectorPath(page('$lib/world/render'), exists)).toBe(
			'src/lib/world/render/index.ts',
		);
	});

	it('resolves a file module, preferred over a directory of the same name', () => {
		const exists = (path: string) =>
			path === 'src/lib/game/canvas/board.ts' ||
			path === 'src/lib/game/canvas/board/index.ts';
		expect(selectorPath(page('$lib/game/canvas/board'), exists)).toBe(
			'src/lib/game/canvas/board.ts',
		);
	});

	it('refuses a page that does not import loadCanvasComponent', () => {
		expect(() =>
			selectorPath(`<script>import x from '$lib/a';</script>`, () => true),
		).toThrow(/no longer imports loadCanvasComponent/);
	});

	it('refuses an import that resolves to nothing', () => {
		expect(() => selectorPath(page('$lib/gone'), () => false)).toThrow(
			/none of src\/lib\/gone\.ts, src\/lib\/gone\/index\.ts exists/,
		);
	});
});

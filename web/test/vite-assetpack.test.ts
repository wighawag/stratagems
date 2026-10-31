import {afterEach, describe, expect, it, vi} from 'vitest';
import {
	ASSETS_FOLDER,
	MANIFEST_PATH,
	ensureManifest,
	withServedPaths,
} from '../vite.assetpack';

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
}));
const fs = vi.mocked(await import('node:fs'));

/**
 * The manifest path rewrite, which is the workaround that EARNED this branch.
 *
 * `with/pixi-js` exists because the sprite pipeline had already been written
 * twice - reveal-or-die and conquest-v1, independently - and both authors
 * reached the same two workarounds. This is one of them
 * (pixijs/assetpack#148: assetpack records paths relative to its output folder
 * while the app loads them from the site root), and neither existing copy has a
 * test for it.
 *
 * It is worth one, because its failure mode is the worst kind: nothing checks
 * that a path in the manifest resolves to a file that exists, so getting it
 * wrong is a 404 at runtime inside `Assets.loadBundle`, on a URL nobody typed,
 * in a build that succeeded.
 */

const bundleWith = (src: unknown) => ({
	bundles: [{name: 'default', assets: [{alias: ['sprites'], src}]}],
});

const srcOf = (manifest: ReturnType<typeof bundleWith>) =>
	manifest.bundles[0].assets[0].src;

/**
 * The OTHER workaround that earned this branch, and the one its own suite had
 * no test for until a mutation went looking.
 *
 * `ensureManifest`'s doc comment names the exact bug it was written the wrong
 * way round as - writing the placeholder only when there is NO art - and says
 * it was caught by running `check` against a fresh clone. Nothing pinned it, so
 * reintroducing it passed all six tests of this file. It is the recorded rule
 * firing again: **when a module justifies its existence by taking over a
 * hazard, that hazard is the first thing its suite should assert about it.**
 *
 * The mutation is invisible to an ordinary run for a reason worth keeping: the
 * manifest is on disk in any tree that has ever built, so the branch the bug
 * lives in is only ever taken on a FRESH clone - which is the case no developer
 * is in and CI is always in.
 */
describe('ensureManifest', () => {
	afterEach(() => vi.resetAllMocks());

	const present = (...paths: string[]) =>
		fs.existsSync.mockImplementation((p) => paths.includes(String(p)));

	/**
	 * THE ONE THE BUG WAS. A clone WITH art still has no manifest until
	 * `buildStart`, and neither `svelte-check` nor `vitest` ever gets there, so
	 * this is the case that fails to type-check if the placeholder is made
	 * conditional on there being nothing to build.
	 */
	it('writes the placeholder even when there IS art to build', () => {
		present(ASSETS_FOLDER);
		expect(ensureManifest()).toEqual({hasArt: true});
		expect(fs.writeFileSync).toHaveBeenCalledOnce();
		const [path, contents] = fs.writeFileSync.mock.calls[0];
		expect(path).toBe(MANIFEST_PATH);
		expect(JSON.parse(String(contents))).toEqual({
			bundles: [{name: 'default', assets: []}],
		});
	});

	it('writes the placeholder when there is no art either', () => {
		present();
		expect(ensureManifest()).toEqual({hasArt: false});
		expect(fs.writeFileSync).toHaveBeenCalledOnce();
	});

	/**
	 * The other direction, and it costs a real build: clobbering a manifest the
	 * pipeline has just written would empty the bundle list and 404 every sprite.
	 */
	it('never overwrites a manifest that already exists', () => {
		present(MANIFEST_PATH, ASSETS_FOLDER);
		expect(ensureManifest()).toEqual({hasArt: true});
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});
});

describe('withServedPaths', () => {
	/**
	 * The shape assetpack ACTUALLY emitted for this template's own sprite,
	 * copied from a real build rather than imagined: an array of objects, each
	 * carrying a `progressSize` alongside the path.
	 */
	it('prefixes the real shape assetpack emits', () => {
		const manifest = bundleWith([
			{src: 'sprites-n2p-sQ.png.json', progressSize: 0.5},
		]);
		expect(srcOf(withServedPaths(manifest))).toEqual([
			{src: '/assets/sprites-n2p-sQ.png.json', progressSize: 0.5},
		]);
	});

	it('prefixes a bare string', () => {
		const manifest = bundleWith(['sprites.png.json']);
		expect(srcOf(withServedPaths(manifest))).toEqual([
			'/assets/sprites.png.json',
		]);
	});

	/**
	 * The case reveal-or-die's copy would throw on: an `src` that is not an
	 * array at all. Taken from conquest's copy, which is why this file says the
	 * reconciliation went that way rather than the other.
	 */
	it('prefixes an src that is not an array', () => {
		expect(srcOf(withServedPaths(bundleWith('sprites.png.json')))).toBe(
			'/assets/sprites.png.json',
		);
		expect(srcOf(withServedPaths(bundleWith({src: 'a.json'})))).toEqual({
			src: '/assets/a.json',
		});
	});

	/**
	 * IDEMPOTENCE IS LOAD-BEARING, not a nicety. In dev the plugin runs
	 * `ap.watch(() => fixManifest())`, so the same manifest is rewritten on
	 * every change to the art. Without the `startsWith('/')` guard the second
	 * pass produces `/assets/assets/...` and the sprites 404 - and only in dev,
	 * only after an edit, which is the hardest possible time to notice.
	 */
	it('leaves an already-prefixed path alone, however many times it runs', () => {
		const manifest = bundleWith([{src: 'sprites.png.json', progressSize: 1}]);
		const once = withServedPaths(manifest);
		const twice = withServedPaths(once);
		const thrice = withServedPaths(twice);
		expect(srcOf(thrice)).toEqual([
			{src: '/assets/sprites.png.json', progressSize: 1},
		]);
	});

	it('rewrites every asset of every bundle, not just the first', () => {
		const manifest = {
			bundles: [
				{name: 'default', assets: [{src: ['a.json']}, {src: ['b.json']}]},
				{name: 'later', assets: [{src: ['c.json']}]},
			],
		};
		withServedPaths(manifest);
		expect(manifest.bundles[0].assets.map((a) => a.src)).toEqual([
			['/assets/a.json'],
			['/assets/b.json'],
		]);
		expect(manifest.bundles[1].assets[0].src).toEqual(['/assets/c.json']);
	});

	/**
	 * The empty manifest is a SUPPORTED state, not a degenerate one: a clone
	 * without `../assets` writes exactly this and has to build and run.
	 */
	it('accepts the empty manifest a clone with no art gets', () => {
		const empty = {bundles: [{name: 'default', assets: []}]};
		expect(() => withServedPaths(empty)).not.toThrow();
		expect(empty).toEqual({bundles: [{name: 'default', assets: []}]});
	});
});

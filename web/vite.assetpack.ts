/**
 * The sprite pipeline: authored art into `static/assets`, plus a manifest.
 *
 * THIS BRANCH'S, and in its own file for that reason. `vite.config.ts` is the
 * template's and is byte-identical to jolly-roger's, so anything put in there
 * has to be merged around on every cascade forever. Here it is a file no other
 * node has, so it can never conflict, and the edit to the shared config is two
 * lines (an import and one entry in `plugins`).
 *
 * WHY THIS IS ON `with/pixi-js` AND NOT ON `main`. assetpack emits a PIXI
 * manifest - `pixiPipes`, a pixi spritesheet, read back through pixi's
 * `Assets` - so it means nothing away from pixi, and a twgl or three.js game
 * would need a second reader rather than this one. D11 in
 * `work:work/specs/proposed/games-on-this-foundation.md` has the full argument;
 * the short form is that an art pipeline and a rendering library are one node,
 * and coupling an art pipeline to an IDENTITY branch instead would be the
 * lattice the plan exists to prevent.
 *
 * THIS FILE IS A MOVE, NOT A THIRD IMPLEMENTATION. It is the reconciliation of
 * two independently authored copies - `reveal-or-die/web/vite.assetpack.ts`
 * (139 lines) and `conquest-v1/web/vite-assetpack.ts` (117) - which is what
 * earned this node in the first place: two people wrote it twice and hit the
 * same two workarounds. Where they differ, this takes:
 *
 * - conquest's {@link fixManifest}, which copes with an `src` that is not an
 *   array. reveal-or-die's assumes it always is, which is true of every
 *   manifest it has met so far and is not a property assetpack promises.
 * - reveal-or-die's EXPLICIT output folder rather than conquest's derivation
 *   from vite's `publicDir`. SvelteKit serves `static/`, and deriving that by
 *   string-replacing `process.cwd()` out of a resolved path is the more
 *   fragile half of the two.
 * - a self-disable that lives HERE rather than in the caller. Both copies put
 *   the `existsSync` check in `vite.config.ts`, which is what made their shared
 *   edit four lines instead of two.
 *
 * Their copies are NOT deleted yet, and that is tracked rather than forgotten:
 * neither descendant inherits this branch until reveal-or-die's `stemBranch`
 * moves to `with/all`, so deleting them now would remove a working art build
 * from a finished game rather than move it. See
 * `work:work/notes/observations/the-asset-pipeline-move-cannot-complete-until-the-repoint.md`
 * for the exact list and the trigger.
 */
import type {Plugin, ResolvedConfig} from 'vite';
import {AssetPack, type AssetPackConfig} from '@assetpack/core';
import {pixiPipes} from '@assetpack/core/pixi';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';

/**
 * Where the authored art lives, OUTSIDE `web/` so it is never served raw.
 *
 * A path rather than a glob because it is also the existence check: no folder
 * means no art, which is a supported state and not an error. Source art is
 * routinely large and versioned separately, so a clone without it must still
 * build.
 */
export const ASSETS_FOLDER = '../assets';

/**
 * Where the built sprites go: `static/`, because that is what SvelteKit serves,
 * and at `/assets/` because that is the prefix {@link fixManifest} writes.
 *
 * NAMED EXPLICITLY, and it has to be. Assetpack's default output is `./dist`,
 * so leaving it out does not mean "no opinion", it means "somewhere the app
 * does not serve from".
 */
export const OUTPUT_FOLDER = './static/assets';

/**
 * The generated manifest, which is GITIGNORED.
 *
 * Under `src/` because the app imports it as a module (`$lib/manifest.json`)
 * rather than fetching it, so it has to resolve at build time.
 */
export const MANIFEST_PATH = './src/lib/manifest.json';

/**
 * Guarantee `$lib/manifest.json` exists, and say whether there is art to build.
 *
 * The empty manifest is the normal state of a fresh clone: the file is
 * generated and gitignored, and `svelte-check` and `vitest` both resolve the
 * import without ever running the pipeline. Without this they fail on a missing
 * module, which reads as a broken checkout rather than as a missing build step.
 *
 * THE ABSENCE CHECK IS UNCONDITIONAL ON THERE BEING ART, and that is not the
 * obvious way round. The tempting version only writes the placeholder when
 * there is nothing to build, on the reasoning that a repo WITH art will get a
 * real manifest - but it gets one at `buildStart`, which is long after
 * `svelte-check` and `vitest` have had to resolve the import, and never at all
 * for those two since neither runs the pipeline. So a fresh clone that DOES
 * have art would be the one that failed to type-check, which is both backwards
 * and the harder case to diagnose. This was written the wrong way round first
 * and caught by running `check` on a fresh manifest; both copies this file was
 * reconciled from have it right.
 */
export function ensureManifest(): {hasArt: boolean} {
	if (!existsSync(MANIFEST_PATH)) {
		writeFileSync(
			MANIFEST_PATH,
			JSON.stringify({bundles: [{name: 'default', assets: []}]}, null, 2),
		);
	}
	return {hasArt: existsSync(ASSETS_FOLDER)};
}

/**
 * Rewrite the manifest's paths to the ones the browser will actually ask for.
 *
 * Works around https://github.com/pixijs/assetpack/issues/148: assetpack records
 * paths relative to its OUTPUT folder, and the app loads them from the site
 * root, so `sprites-X.png.json` has to become `/assets/sprites-X.png.json`.
 *
 * This prefix and {@link OUTPUT_FOLDER} are two halves of one decision and will
 * break silently if they drift, because nothing checks that a path in the
 * manifest resolves to a file that exists: the symptom is a 404 at runtime
 * inside `Assets.loadBundle`, on a URL nobody typed.
 *
 * PURE, and separated from the file it is usually applied to, because this is
 * the half worth testing: the workaround is the reason this node exists (two
 * authors hit it independently) and it is a string transformation with three
 * input shapes and an idempotence requirement. The IO half is two lines and
 * needs no test. Same split as `gestures.ts` and the input recognisers.
 */
export function withServedPaths<T>(manifest: T): T {
	function transform(value: string | {src: string}): string | {src: string} {
		if (typeof value === 'string') {
			return value.startsWith('/') ? value : `/assets/${value}`;
		}
		if (!value.src.startsWith('/')) value.src = `/assets/${value.src}`;
		return value;
	}

	for (const bundle of (manifest as {bundles: {assets: {src: unknown}[]}[]})
		.bundles) {
		for (const asset of bundle.assets) {
			// The three shapes assetpack has been observed to emit. The scalar and
			// object cases come from conquest's copy; reveal-or-die's handles only
			// the array and would throw on the others, which is the kind of thing
			// that only shows up when somebody adds a new kind of asset.
			if (Array.isArray(asset.src)) {
				asset.src = asset.src.map(transform);
			} else {
				asset.src = transform(asset.src as string | {src: string});
			}
		}
	}
	return manifest;
}

/** {@link withServedPaths}, read and written back to {@link MANIFEST_PATH}. */
function fixManifest() {
	const jsonContent = withServedPaths(
		JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')),
	);
	writeFileSync(MANIFEST_PATH, JSON.stringify(jsonContent, null, 2));
}

/**
 * The vite plugin, or `false` when there is nothing to do.
 *
 * Returning `false` is deliberate: vite filters falsy entries out of `plugins`,
 * so the caller writes `assetpackPlugin()` and nothing else, and the decision
 * about WHEN the pipeline runs stays in this file with the paths it depends on.
 * That is what keeps the edit to the shared `vite.config.ts` down to two lines.
 *
 * Two cases where it does nothing, and both are normal rather than errors:
 * a clone with no `../assets`, and a vitest run, which has no use for built
 * sprites and would otherwise pay for them on every invocation.
 */
export function assetpackPlugin(): Plugin | false {
	// Always, even when the pipeline will not run: the manifest import has to
	// resolve for `svelte-check` and `vitest` whatever else is true.
	const {hasArt} = ensureManifest();
	if (!hasArt || process.env.VITEST) return false;

	const apConfig: AssetPackConfig = {
		entry: ASSETS_FOLDER,
		output: OUTPUT_FOLDER,
		logLevel: 'verbose',
		strict: true,
		pipes: [
			...pixiPipes({
				resolutions: {default: 1},
				compression: {png: true, jpg: true, webp: false},
				manifest: {
					output: MANIFEST_PATH,
					includeFileSizes: 'raw',
					includeMetaData: true,
					trimExtensions: true,
				},
			}),
		],
		assetSettings: [
			{
				files: ['**/sprites'],
				metaData: {tps: true},
			},
		],
	};

	let mode: ResolvedConfig['command'];
	let ap: AssetPack | undefined;

	return {
		name: 'assetpack',
		configResolved: (resolvedConfig) => {
			mode = resolvedConfig.command;
		},
		buildStart: async () => {
			if (mode === 'serve') {
				if (ap) return;
				ap = new AssetPack(apConfig);
				void ap.watch(() => fixManifest());
			} else {
				await new AssetPack(apConfig).run();
				fixManifest();
			}
		},
		buildEnd: async () => {
			if (ap) {
				await ap.stop();
				ap = undefined;
			}
		},
	};
}

import adapter from '@sveltejs/adapter-static';
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte';
import {execSync} from 'child_process';

// stratagems' version id, kept as it was: a deterministic build needs a
// deterministic version (the commit), with no `-dirty` suffix, because the alpha1
// verification compares builds.
export function getVersion() {
	try {
		return execSync('git rev-parse --short HEAD').toString().trim();
	} catch {
		const timestamp = Date.now().toString();
		console.error(`could not get commit-hash to set a version id, falling back on timestamp ${timestamp}`);
		return timestamp;
	}
}
const VERSION = getVersion();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess()],

	kit: {
		adapter: adapter(),
		version: {
			// we create a dertemrinistic building using a derterministic version (via git commit, see above)
			name: VERSION,
		},
		alias: {
			// stratagems' own aliases
			// alias for web-config
			'web-config': './src/web-config.json',
			$data: './src/data',
			$utils: './src/utils',

			// FROM template-commit-reveal: the framework's two slots.
			//
			// WHICH UI KIT PAINTS THE BUILDING BLOCKS. Only `src/lib/core/ui/*` imports
			// through this (see src/lib/core/ui/README.md); it resolves to where the
			// shadcn CLI writes (components.json).
			$ui: 'src/lib/shadcn/ui',

			// WHICH APP THE FRAMEWORK IS COMPOSED WITH. The framework imports
			// `$app-specific` and never the app's module by path; this points it at
			// stratagems' module, which exports the same names as the template's
			// `src/lib/placement/game.ts` (omitted here, see .offshoot-omissions).
			// `test/alias-targets.test.ts` fails if this names a missing file.
			//
			// Not `$app`, which is SvelteKit's. An alias matches only itself or itself
			// plus `/`, so `$app-specific` and `$app/navigation` never capture each other.
			'$app-specific': 'src/lib/stratagems/game.ts',
		},
		serviceWorker: {
			// we handle it ourselves here : src/service-worker-handler.ts
			register: false,
		},
		paths: {
			// this is to make it work on ipfs (on an unknown path)
			relative: true,
		},
	},
};

export default config;

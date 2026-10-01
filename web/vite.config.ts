import {sentryVitePlugin} from '@sentry/vite-plugin';
import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		process.env['SENTRY_AUTH_TOKEN']
			? sentryVitePlugin({
					telemetry: false,
					org: 'etherplay',
					project: 'stratagems',
				})
			: undefined,
	],
	// the indexer worker (src/lib/stratagems/state/indexer.worker.ts) is a MODULE worker
	worker: {
		format: 'es',
	},
	build: {
		minify: false,
		sourcemap: true,
	},
});

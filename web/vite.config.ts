import {sentryVitePlugin} from '@sentry/vite-plugin';
import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		sentryVitePlugin({
			telemetry: false,
			org: 'etherplay',
			project: 'stratagems',
		}),
	],
	build: {
		minify: false,
		sourcemap: true,
	},
});

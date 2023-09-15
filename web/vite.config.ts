import {sentryVitePlugin} from '@sentry/vite-plugin';
import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';
import {getReleaseID} from './release.js';

export default defineConfig({
	plugins: [
		sveltekit(),
		sentryVitePlugin({
			org: 'etherplay',
			project: 'stratagems',
		}),
	],
	define: {
		__SENTRY_RELEASE__: getReleaseID(),
	},
	build: {
		minify: false,
		sourcemap: true,
	},
});

import {sentryVitePlugin} from '@sentry/vite-plugin';
import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';
import {getVersion} from './version.js';

export default defineConfig({
	plugins: [
		sveltekit(),
		sentryVitePlugin({
			org: 'etherplay',
			project: 'stratagems',
		}),
	],
	define: {
		__SENTRY_RELEASE__: getVersion(),
	},
	build: {
		minify: false,
		sourcemap: true,
	},
});

import {sentryVitePlugin} from '@sentry/vite-plugin';
import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';
import {getVersion} from './version.js';

export default defineConfig({
	plugins: [
		sveltekit(),
		sentryVitePlugin({
			telemetry: false,
			org: 'etherplay',
			project: 'stratagems',
		}),
	],
	define: {
		__PUBLIC_SENTRY_RELEASE__: `'${getVersion()}'`,
	},
	build: {
		minify: false,
		sourcemap: true,
	},
});

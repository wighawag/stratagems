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
	build: {
		minify: false,
		sourcemap: true,
	},
});

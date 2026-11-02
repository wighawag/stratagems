import {defineConfig, devices} from '@playwright/test';
// THE LAN REHEARSAL (step L2, item 7): the static `lan` build served over plain
// http on a non-localhost address, against a geth dev chain and the box's
// faucet. No web server here: everything is already running.
export default defineConfig({
	testDir: '.',
	testMatch: /lan-rehearsal\.ts$/,
	timeout: 15 * 60_000,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: process.env.LAN_URL,
		...devices['Desktop Chrome'],
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
	outputDir: '/tmp/l2-lan-results',
});

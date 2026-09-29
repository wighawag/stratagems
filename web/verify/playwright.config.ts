import {defineConfig, devices} from '@playwright/test';

/**
 * `pnpm --filter ./web verify:alpha1`: drive the BUILT app in a real Chromium, see
 * `alpha1.spec.ts`. Not part of `pnpm build` or CI: it needs a browser binary and a
 * node for Base (`VERIFY_ETH_NODE`), and it folds alpha1 once from its start block.
 */
export default defineConfig({
	testDir: '.',
	timeout: 45 * 60 * 1000,
	expect: {timeout: 60 * 1000},
	fullyParallel: false,
	workers: 1,
	reporter: [['list']],
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// two tabs index at once and only one is in front: without these, Chromium
				// throttles the timers of the one behind (to one wake-up a minute after five
				// minutes), and the worker's fetch loop with them
				launchOptions: {
					args: [
						'--disable-background-timer-throttling',
						'--disable-renderer-backgrounding',
						'--disable-backgrounding-occluded-windows',
					],
				},
			},
		},
	],
});

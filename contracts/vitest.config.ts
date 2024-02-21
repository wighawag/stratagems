import {defineConfig} from 'vitest/config';

import builtins from 'rollup-plugin-node-builtins';
const builtinsPlugin = builtins({crypto: true});

export default defineConfig({
	test: {
		coverage: {
			provider: 'custom',
			customProviderModule: 'vitest-solidity-coverage',
		},
		testTimeout: 20000,
	},
	build: {
		rollupOptions: {
			plugins: [builtinsPlugin],
		},
	},
});

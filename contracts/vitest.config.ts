import {defineConfig, configDefaults} from 'vitest/config';

export default defineConfig({
	test: {
		testTimeout: 20000,
		// test/js is the commit-reveal base's suite, run by Hardhat's node test runner
		exclude: [...configDefaults.exclude, 'test/js/**'],
	},
});

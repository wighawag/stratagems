import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import tsconfigPaths from 'vite-tsconfig-paths';
import {execSync} from 'child_process';
import * as fs from 'fs';

let VERSION = `timestamp_${Date.now()}`;
try {
	VERSION = execSync('git rev-parse --short HEAD', {stdio: ['ignore', 'pipe', 'ignore']})
		.toString()
		.trim();
} catch (e) {
	console.error(e);
}
console.log(`VERSION: ${VERSION}`);

if (!process.env.VITE_CHAIN_ID) {
	try {
		const contractsInfo = JSON.parse(fs.readFileSync('./src/app/data/contracts.json', 'utf-8'));
		process.env.VITE_CHAIN_ID = contractsInfo.chainId;
	} catch (e) {
		console.error(e);
	}
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [tsconfigPaths(), svelte()],
	build: {
		target: ['ES2020'],
	},
	define: {
		__VERSION__: JSON.stringify(VERSION),
	},
});

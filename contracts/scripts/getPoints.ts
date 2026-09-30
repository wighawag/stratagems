import {indexAll} from './data/main.js';

async function main() {
	const state = await indexAll();
	console.log(state.computedPoints);
}
main();

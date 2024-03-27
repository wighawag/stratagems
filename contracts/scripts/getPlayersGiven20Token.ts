import {indexPlayersGiven20Tokens} from './data/players';

async function main() {
	const state = await indexPlayersGiven20Tokens();
	console.log(state.players);
}
main();

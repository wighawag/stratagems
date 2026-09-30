import {indexPlayersWithWithdrawals} from './data/playerWithWithdrawals.js';

async function main() {
	const state = await indexPlayersWithWithdrawals();
	console.log(state.players);
}
main();

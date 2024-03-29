import {indexPlayersWithWithdrawals} from './data/playerWithWithdrawals';

async function main() {
	const state = await indexPlayersWithWithdrawals();
	console.log(state.players);
}
main();

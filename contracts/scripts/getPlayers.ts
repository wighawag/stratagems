import {formatEther} from 'viem';
import {indexPlayers} from './data/players';

async function main() {
	const state = await indexPlayers();
	console.log(
		Object.keys(state.players).map((v) => ({
			address: v,
			balance: formatEther(state.players[v].balance),
			tokenGiven: formatEther(state.players[v].tokenGiven),
		})),
	);
}
main();

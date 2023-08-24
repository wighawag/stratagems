import {account, accountData} from '$lib/web3';

import {state} from '$lib/blockchain/state/State';
import {xyToXYID, type Color} from 'stratagems-common';
import {get} from 'svelte/store';

export class ActionHandler {
	onCell(x: number, y: number) {
		// console.log(x, y);
		const player = account.$state.address || '0xFF';
		if (!player) {
			console.log('no account');
			// return; // TODO
		}
		const currentState = get(state);
		const currentOffchainState = get(accountData.offchainState);
		const cellID = xyToXYID(x, y);
		const currentCell = currentState.cells[cellID];
		const currentMove = currentOffchainState.moves.find((v) => v.x === x && v.y === y);
		if (currentMove) {
			accountData.offchainState.removeMove(x, y);
			const color = ((currentMove.color + 1) % 5) as Color;
			if (color > 0) {
				accountData.offchainState.addMove({x, y, color, player});
			}
		} else {
			accountData.offchainState.addMove({x, y, color: 1, player});
		}
	}
}

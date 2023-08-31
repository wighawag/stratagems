import {account, accountData} from '$lib/web3';

import {xyToXYID, type Color} from 'stratagems-common';
import {get} from 'svelte/store';
import {viewState} from '$lib/state/ViewState';

export class ActionHandler {
	onCell(x: number, y: number) {
		// console.log(x, y);
		const player = account.$state.address || '0xFF';
		if (!player) {
			console.log('no account');
			// return; // TODO
		}
		const currentState = get(viewState);
		const currentOffchainState = get(accountData.offchainState);
		const cellID = xyToXYID(x, y);

		console.log({x, y, cellID});

		const currentMove = currentOffchainState.moves?.find((v) => v.x === x && v.y === y);
		if (currentMove) {
			accountData.offchainState.removeMove(x, y);
			const color = ((currentMove.color + 1) % 6) as Color;
			if (color > 0) {
				accountData.offchainState.addMove({x, y, color, player});
			}
		} else {
			if (currentState.cells[cellID] && currentState.cells[cellID].next.life !== 0) {
				throw new Error(`Cell already occupied`);
			}
			accountData.offchainState.addMove({x, y, color: 1, player});
		}
	}
}

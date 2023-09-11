import {account, accountData} from '$lib/web3';

import {xyToXYID, Color} from 'stratagems-common';
import {get} from 'svelte/store';
import {viewState} from '$lib/state/ViewState';

export class ActionHandler {
	onCell(x: number, y: number) {
		// console.log(x, y);
		const player = account.$state.address;
		if (!player) {
			console.log('no account');
			return; // TODO
		}
		const currentState = get(viewState);
		const currentOffchainState = get(accountData.offchainState);
		const cellID = xyToXYID(x, y);

		console.log({x, y, cellID});

		console.log(currentState.cells[cellID]);
		console.log(currentState.owners[cellID]);

		const currentMove = currentOffchainState.moves?.find((v) => v.x === x && v.y === y);
		if (currentMove) {
			accountData.offchainState.removeMove(x, y);
			if (currentMove.color === Color.None) {
				console.log(`remove cell at ${x}, ${y}, ${player}`);
				accountData.offchainState.removeMove(x, y);
			} else {
				const color = ((currentMove.color + 1) % 6) as Color; // 7 to put black
				if (color == Color.None) {
					accountData.offchainState.removeMove(x, y);
				} else {
					console.log(`switch color ${color} cell at ${x}, ${y}, ${player}`);
					accountData.offchainState.addMove({x, y, color, player});
				}
			}
		} else {
			if (
				currentState.cells[cellID] &&
				currentState.owners[cellID].toLowerCase() === account.$state.address?.toLowerCase() &&
				currentState.cells[cellID].next.life === 7
			) {
				console.log(`remove cell at ${x}, ${y}, ${player}`);
				accountData.offchainState.addMove({x, y, color: Color.None, player});
			} else if (currentState.cells[cellID] && currentState.cells[cellID].next.life !== 0) {
				throw new Error(`Cell already occupied`);
			} else {
				console.log(`add color at ${x}, ${y}, ${player}`);
				accountData.offchainState.addMove({x, y, color: 1, player});
			}
		}
	}
}

import {account} from '$lib/web3';
import {actionState} from './ActionState';
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
		const currentActionState = get(actionState);
		const cellID = xyToXYID(x, y);
		const currentCell = currentState.cells[cellID];
		const currentMove = currentActionState.find((v) => v.x === x && v.y === y);
		if (currentMove) {
			actionState.removeMove(x, y);
			const color = ((currentMove.color + 1) % 5) as Color;
			if (color > 0) {
				actionState.addMove({x, y, color, player});
			}
		} else {
			actionState.addMove({x, y, color: 1, player});
		}
	}
}

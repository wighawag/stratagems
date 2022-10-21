import {wallet} from '$app/blockchain/wallet';
import {actionState} from '$app/state/ActionState';
import {state} from '$app/state/State';
import {xyToXYID, type CellColor} from 'stratagems-indexer';
import {get} from 'sveltore';

export class ActionHandler {
	onCell(x: number, y: number) {
		const currentState = get(state);
		const currentActionState = get(actionState);
		const cellID = xyToXYID(x, y);
		const currentCell = currentState.cells[cellID];
		const currentMove = currentActionState.find((v) => v.x === x && v.y === y);
		if (currentMove) {
			actionState.removeMove(x, y);
			const color = ((currentMove.color + 1) % 5) as CellColor;
			if (color > 0) {
				actionState.addMove({x, y, color, player: wallet.address});
			}
		} else {
			actionState.addMove({x, y, color: 1, player: wallet.address});
		}
	}
}

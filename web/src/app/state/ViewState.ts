import {copy} from '$lib/utils';
import {xyToXYID, type Cell, type Data} from 'stratagems-indexer';
import {derived} from 'sveltore';
import {actionState, type LocalMoves} from './ActionState';
import {state} from './State';

export type ViewCell = Cell & {
	localState?: 'pending' | 'planned';
};

export type ViewData = Data & {
	cells: {
		[pos: string]: ViewCell;
	};
};

function merge(state: Data, actionState: LocalMoves): ViewData {
	const viewState = copy<ViewData>(state);
	for (const action of actionState) {
		const cellID = xyToXYID(action.x, action.y);
		const existingCell = viewState.cells[cellID];
		if (!existingCell) {
			viewState.cells[cellID] = {
				color: action.color,
				owner: action.player,
				localState: 'planned',
			};
		} else {
			// TODO
		}
	}
	return viewState;
}

export const viewState = derived([state, actionState], ([$state, $actionState]) => {
	return merge($state, $actionState);
});

import {copy} from '$lib/utils/js';
import {xyToXYID, type ContractCell} from 'stratagems-common';
import type {Data} from 'stratagems-indexer';
import {derived} from 'svelte/store';
import {actionState, type LocalMoves} from '$lib/action/ActionState';
import {state} from '$lib/blockchain/state/State';

export type ViewCell = ContractCell & {
	localState?: 'pending' | 'planned';
};

export type ViewData = Data & {
	cells: {
		[pos: string]: ViewCell;
	};
	owners: {[pos: string]: `0x${string}`};
};

function merge(state: Data, actionState: LocalMoves): ViewData {
	const viewState = copy<ViewData>(state);
	for (const action of actionState) {
		const cellID = xyToXYID(action.x, action.y);
		const existingCell = viewState.cells[cellID];
		if (!existingCell) {
			const newCell: ViewCell = {
				color: action.color,
				localState: 'planned',
				delta: 0, // TODO delta for viewState
				enemymask: 0, // TODO enemymask for viewState
				epochWhenTokenIsAdded: 0, // TODO current epoch
				lastEpochUpdate: 0, // TODO lastEpochUpdate for viewState
				life: 1,
			};
			// console.log({newCell});
			viewState.cells[cellID] = newCell;
			viewState.owners[cellID] = action.player as `0x${string}`;
		} else {
			// TODO
		}
	}
	return viewState;
}

export const viewState = derived([state, actionState], ([$state, $actionState]) => {
	return merge($state, $actionState);
});

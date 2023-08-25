import {copy} from '$lib/utils/js';
import {xyToXYID, type ContractCell} from 'stratagems-common';
import type {Data} from 'stratagems-indexer';
import {derived} from 'svelte/store';
import {state} from '$lib/blockchain/state/State';
import type {OffchainState, OnChainActions} from '$lib/web3/account-data';
import {accountData} from '$lib/web3';
import {epoch, epochInfo} from '$lib/blockchain/state/Epoch';

export type ViewCell = ContractCell & {
	localState?: 'pending' | 'planned';
};

export type ViewData = Data & {
	cells: {
		[pos: string]: ViewCell;
	};
	owners: {[pos: string]: `0x${string}`};
};

function merge(state: Data, offchainState: OffchainState, onchainActions: OnChainActions, epoch: number): ViewData {
	const viewState = copy<ViewData>(state);
	if (offchainState.moves !== undefined) {
		for (const move of offchainState.moves) {
			const cellID = xyToXYID(move.x, move.y);
			const existingCell = viewState.cells[cellID];
			if (!existingCell) {
				const newCell: ViewCell = {
					color: move.color,
					localState: 'planned',
					delta: 0, // TODO delta for viewState
					enemymask: 0, // TODO enemymask for viewState
					epochWhenTokenIsAdded: 0, // TODO current epoch
					lastEpochUpdate: 0, // TODO lastEpochUpdate for viewState
					life: 1,
				};
				// console.log({newCell});
				viewState.cells[cellID] = newCell;
				viewState.owners[cellID] = move.player as `0x${string}`;
			} else {
				// TODO
			}
		}
	} else {
		for (const txHash of Object.keys(onchainActions)) {
			const action = onchainActions[txHash as `0x${string}`];
			if (action.tx.metadata) {
				const metadata = action.tx.metadata;
				if (metadata.type === 'commit') {
					// TODO
					if (metadata.epoch == epoch) {
						for (const move of metadata.localMoves) {
							const cellID = xyToXYID(move.x, move.y);
							const existingCell = viewState.cells[cellID];
							if (!existingCell) {
								const newCell: ViewCell = {
									color: move.color,
									localState: 'planned',
									delta: 0, // TODO delta for viewState
									enemymask: 0, // TODO enemymask for viewState
									epochWhenTokenIsAdded: 0, // TODO current epoch
									lastEpochUpdate: 0, // TODO lastEpochUpdate for viewState
									life: 1,
								};
								// console.log({newCell});
								viewState.cells[cellID] = newCell;
								viewState.owners[cellID] = move.player as `0x${string}`;
							} else {
								// TODO
							}
						}
					}
				}
			}
		}
	}

	return viewState;
}

export const viewState = derived(
	[state, accountData.offchainState, accountData.onchainActions, epoch],
	([$state, $offchainState, $onchainActions, $epoch]) => {
		return merge($state, $offchainState, $onchainActions, $epoch);
	},
);

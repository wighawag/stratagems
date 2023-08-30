import {copy} from '$lib/utils/js';
import {xyToXYID, type ContractCell, bigIntIDToBigintXY, bigIntIDToXY, StratagemsContract} from 'stratagems-common';
import type {Data} from 'stratagems-indexer';
import {derived} from 'svelte/store';
import {state} from '$lib/blockchain/state/State';
import {localMoveToContractMove, type OffchainState, type OnChainActions} from '$lib/web3/account-data';
import {account, accountData} from '$lib/web3';
import {epoch, epochInfo} from '$lib/blockchain/state/Epoch';

export type ViewCell = ContractCell & {
	localState?: 'pending' | 'planned';
};

export type ViewData = {
	cells: {
		[pos: string]: {next: ViewCell; future: ViewCell};
	};
	owners: {[pos: string]: `0x${string}`};
};

function merge(state: Data, offchainState: OffchainState, onchainActions: OnChainActions, epoch: number): ViewData {
	const copyState = copy(state);
	const stratagems = new StratagemsContract(copyState, 7);

	if (offchainState.moves !== undefined) {
		for (const move of offchainState.moves) {
			// TODO we should have access to the account from offchainState
			stratagems.computeMove(account.$state.address as `0x${string}`, epoch + 1, localMoveToContractMove(move));
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
							stratagems.computeMove(account.$state.address as `0x${string}`, epoch + 1, localMoveToContractMove(move));
						}
					}
				}
			}
		}
	}

	const viewState: ViewData = {cells: {}, owners: {}};
	for (const cellID of Object.keys(copyState.cells)) {
		const {x, y} = bigIntIDToXY(BigInt(cellID));
		const cell = copyState.cells[cellID];
		const next = stratagems.getUpdatedCell(BigInt(cellID), epoch + 1);
		const future = stratagems.getUpdatedCell(BigInt(cellID), epoch + 2);
		// console.log({
		// 	x,
		// 	y,
		// 	cell,
		// 	updatedCell,
		// 	epoch,
		// });
		viewState.cells[xyToXYID(x, y)] = {next, future};
	}
	for (const ownerAddr of Object.keys(copyState.owners)) {
		viewState.owners[ownerAddr] = copyState.owners[ownerAddr];
	}

	return viewState;
}

export const viewState = derived(
	[state, accountData.offchainState, accountData.onchainActions, epoch],
	([$state, $offchainState, $onchainActions, $epoch]) => {
		return merge($state, $offchainState, $onchainActions, $epoch);
	},
);

export type ViewState = Omit<typeof viewState, '$state'>;

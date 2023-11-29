import {copy} from '$lib/utils/js';
import {xyToXYID, type ContractCell, bigIntIDToXY, StratagemsContract, type StratagemsState} from 'stratagems-common';
import type {Data} from 'stratagems-indexer';
import {derived} from 'svelte/store';
import {state} from '$lib/blockchain/state/State';
import {account, accountData} from '$lib/web3';
import {epochState, type EpochState} from '$lib/blockchain/state/Epoch';
import type {AccountState} from 'web3-connection';
import {
	localMoveToContractMove,
	type OffchainState,
	type StratagemsMetadata,
	type StratagemsTransaction,
} from '$lib/account/account-data';
import type {OnChainActions} from '$lib/account/base';
import {createDraft, finishDraft} from 'immer';

export type ViewCell = ContractCell & {
	localState?: 'pending' | 'planned';
};

export type ViewCellData = {next: ViewCell; future: ViewCell; currentPlayer: boolean};

export type StratagemsViewState = StratagemsState & {
	viewCells: {
		[position: string]: ViewCellData;
	};
	owners: {[position: string]: `0x${string}`};
	hasCommitmentToReveal?: {epoch: number; commit?: {hash: `0x${string}`; tx: StratagemsTransaction}};
	hasCommitment?: boolean;
};

function merge(
	state: Data,
	offchainState: OffchainState,
	onchainActions: OnChainActions<StratagemsMetadata>,
	epochState: EpochState,
	account: AccountState<`0x${string}`>,
): StratagemsViewState {
	const copyState = createDraft(state);
	// TODO use finishDraft ?

	const stratagems = new StratagemsContract(copyState, 7);

	// console.log({epoch: epochState.epoch, isActionPhase: epochState.isActionPhase});

	let hasCommitment = false;
	if (offchainState.moves !== undefined) {
		for (const move of offchainState.moves) {
			stratagems.computeMove(account.address as `0x${string}`, epochState.epoch, localMoveToContractMove(move));
		}
	} else {
		for (const txHash of Object.keys(onchainActions)) {
			const action = onchainActions[txHash as `0x${string}`];
			if (action.tx.metadata) {
				const metadata = action.tx.metadata;
				if (metadata.type === 'commit') {
					// TODO
					// TODO || || !action.revealTx
					if (metadata.epoch == epochState.epoch && epochState.isActionPhase) {
						hasCommitment = true;
						for (const move of metadata.localMoves) {
							stratagems.computeMove(account.address as `0x${string}`, epochState.epoch, localMoveToContractMove(move));
						}
					}
				}
			}
		}
	}

	const viewState: StratagemsViewState = {
		cells: {},
		viewCells: {},
		owners: {},
		hasCommitmentToReveal: undefined,
		hasCommitment,
	};
	for (const cellID of Object.keys(copyState.cells)) {
		const {x, y} = bigIntIDToXY(BigInt(cellID));
		const cell = copyState.cells[cellID];
		const next = stratagems.getUpdatedCell(BigInt(cellID), epochState.epoch + 0);
		const future = stratagems.getUpdatedCell(BigInt(cellID), epochState.epoch + 1);
		// console.log({
		// 	x,
		// 	y,
		// 	cell,
		// 	updatedCell,
		// 	epoch,
		// });
		const viewCell = {
			next,
			future,
			currentPlayer: copyState.owners[cellID]?.toLowerCase() === account.address?.toLowerCase(),
		};
		viewState.viewCells[xyToXYID(x, y)] = viewCell;
		viewState.cells[xyToXYID(x, y)] = copyState.cells[cellID];
		// console.log(`${x}, ${y}`, viewCell);
	}
	for (const pos of Object.keys(copyState.owners)) {
		const {x, y} = bigIntIDToXY(BigInt(pos));
		viewState.owners[xyToXYID(x, y)] = copyState.owners[pos];
	}

	if (account.address) {
		const commitment = state.commitments[account.address.toLowerCase()];
		if (commitment && (!epochState.isActionPhase || commitment.epoch < epochState.epoch)) {
			viewState.hasCommitmentToReveal = {epoch: commitment.epoch};
			for (const txHash of Object.keys(onchainActions)) {
				const action = onchainActions[txHash as `0x${string}`];
				if (action.tx.metadata) {
					const metadata = action.tx.metadata;
					if (metadata.type === 'commit') {
						if (metadata.epoch == commitment.epoch) {
							viewState.hasCommitmentToReveal = {
								epoch: commitment.epoch,
								commit: {hash: txHash as `0x${string}`, tx: action.tx},
							};
						}
					}
				}
			}
		}
	}

	return viewState;
}

export const stratagemsView = derived(
	[state, accountData.offchainState, accountData.onchainActions, epochState, account],
	([$state, $offchainState, $onchainActions, $epochState, $account]) => {
		return merge($state, $offchainState, $onchainActions, $epochState, $account);
	},
);

export type StratagemsView = Omit<typeof stratagemsView, '$state'>;

if (typeof window !== 'undefined') {
	(window as any).stratagemsView = stratagemsView;
}

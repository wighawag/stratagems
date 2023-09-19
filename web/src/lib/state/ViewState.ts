import {copy} from '$lib/utils/js';
import {xyToXYID, type ContractCell, bigIntIDToBigintXY, bigIntIDToXY, StratagemsContract} from 'stratagems-common';
import type {Data} from 'stratagems-indexer';
import {derived} from 'svelte/store';
import {state} from '$lib/blockchain/state/State';
import {
	localMoveToContractMove,
	type OffchainState,
	type OnChainActions,
	type StratagemsTransaction,
} from '$lib/web3/account-data';
import {account, accountData} from '$lib/web3';
import {epochState, type EpochState} from '$lib/blockchain/state/Epoch';
import type {AccountState} from 'web3-connection';
import type {PendingTransaction} from 'ethereum-tx-observer';

export type ViewCell = ContractCell & {
	localState?: 'pending' | 'planned';
};

export type ViewCellData = {next: ViewCell; future: ViewCell; contract?: ContractCell; currentPlayer: boolean};

export type ViewData = {
	cells: {
		[pos: string]: ViewCellData;
	};
	owners: {[pos: string]: `0x${string}`};
	hasCommitmentToResolve?: {epoch: number; commit?: {hash: `0x${string}`; tx: StratagemsTransaction}};
	hasCommitment: boolean;
};

function merge(
	state: Data,
	offchainState: OffchainState,
	onchainActions: OnChainActions,
	epochState: EpochState,
	account: AccountState<`0x${string}`>,
): ViewData {
	const copyState = copy(state);
	const stratagems = new StratagemsContract(copyState, 7);

	console.log({epoch: epochState.epoch, isActionPhase: epochState.isActionPhase});

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

	const viewState: ViewData = {cells: {}, owners: {}, hasCommitmentToResolve: undefined, hasCommitment};
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
			contract: copyState.cells[cellID],
			currentPlayer: copyState.owners[cellID]?.toLowerCase() === account.address?.toLowerCase(),
		};
		viewState.cells[xyToXYID(x, y)] = viewCell;
		console.log(`${x}, ${y}`, viewCell);
	}
	for (const pos of Object.keys(copyState.owners)) {
		const {x, y} = bigIntIDToXY(BigInt(pos));
		viewState.owners[xyToXYID(x, y)] = copyState.owners[pos];
	}

	if (account.address) {
		const commitment = state.commitments[account.address.toLowerCase()];
		if (commitment && (!epochState.isActionPhase || commitment.epoch < epochState.epoch)) {
			viewState.hasCommitmentToResolve = {epoch: commitment.epoch};
			for (const txHash of Object.keys(onchainActions)) {
				const action = onchainActions[txHash as `0x${string}`];
				if (action.tx.metadata) {
					const metadata = action.tx.metadata;
					if (metadata.type === 'commit') {
						if (metadata.epoch == commitment.epoch) {
							viewState.hasCommitmentToResolve = {
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

export const viewState = derived(
	[state, accountData.offchainState, accountData.onchainActions, epochState, account],
	([$state, $offchainState, $onchainActions, $epochState, $account]) => {
		return merge($state, $offchainState, $onchainActions, $epochState, $account);
	},
);

export type ViewState = Omit<typeof viewState, '$state'>;

if (typeof window !== 'undefined') {
	(window as any).viewState = viewState;
}

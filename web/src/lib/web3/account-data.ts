import type {EIP1193TransactionWithMetadata} from 'web3-connection';
import type {PendingTransaction, PendingTransactionState} from 'ethereum-tx-observer';
import {initEmitter} from 'radiate';
import {writable} from 'svelte/store';
import {Color, bnReplacer, bnReviver, type ContractMove, xyToBigIntID} from 'stratagems-common';

import {logs} from 'named-logs';
const logger = logs('account-data');

export type LocalMove = {
	player: string;
	color: Color;
	x: number;
	y: number;
};

export type LocalMoves = LocalMove[];

export function localMoveToContractMove(localMove: LocalMove): ContractMove {
	return {
		color: localMove.color,
		position: xyToBigIntID(localMove.x, localMove.y),
	};
}

export type Epoch = {number: number};

export type OffchainState = {
	epoch?: Epoch;
	lastEpochAcknowledged: number;
	moves?: LocalMoves;
};

const defaultOffchainState: OffchainState = {
	moves: undefined,
	lastEpochAcknowledged: 0,
};

export type CommitMetadata = {
	type: 'commit';
	epoch: number;
	localMoves: LocalMoves;
	secret: `0x${string}`;
};

export type RevealMetadata = {
	type: 'reveal';
	commitTx: `0x${string}`;
};

export type AnyMetadata = CommitMetadata | RevealMetadata;

export type StratagemsTransaction<T = AnyMetadata> = EIP1193TransactionWithMetadata & {
	metadata?: {
		epoch: {
			hash: `0x${string}`;
			number: number;
		};
	} & T;
};

export type OnChainAction<T = AnyMetadata> = {
	tx: StratagemsTransaction<T>;
	revealTx?: PendingTransaction;
} & PendingTransactionState;
export type OnChainActions = {[hash: `0x${string}`]: OnChainAction};

export type AccountData = {
	onchainActions: OnChainActions;
	offchainState: OffchainState;
};

const emptyAccountData: AccountData = {onchainActions: {}, offchainState: defaultOffchainState};

function fromOnChainActionToPendingTransaction(hash: `0x${string}`, onchainAction: OnChainAction): PendingTransaction {
	return {
		hash,
		request: onchainAction.tx,
		final: onchainAction.final,
		inclusion: onchainAction.inclusion,
		status: onchainAction.status,
	} as PendingTransaction;
}

export function initAccountData() {
	const emitter = initEmitter<{name: 'newTx'; txs: PendingTransaction[]} | {name: 'clear'}>();

	const $onchainActions: OnChainActions = {};
	const onchainActions = writable<OnChainActions>($onchainActions);

	const $offchainState: OffchainState = defaultOffchainState;
	const offchainState = writable<OffchainState>($offchainState);

	let key: string | undefined;
	async function load(address: `0x${string}`, chainId: string, genesisHash?: string) {
		const data = await _load(address, chainId, genesisHash);

		if (data.offchainState) {
			$offchainState.moves = data.offchainState.moves;
			$offchainState.epoch = data.offchainState.epoch;
			$offchainState.lastEpochAcknowledged = data.offchainState.lastEpochAcknowledged;
			offchainState.set($offchainState);
		}

		for (const hash in data.onchainActions) {
			const onchainAction = (data.onchainActions as any)[hash];
			($onchainActions as any)[hash] = onchainAction;
		}
		onchainActions.set($onchainActions);
		handleTxs($onchainActions);
	}

	function handleTxs(onChainActions: OnChainActions) {
		const pending_transactions: PendingTransaction[] = [];
		for (const hash in onChainActions) {
			const onchainAction = (onChainActions as any)[hash];
			const tx = fromOnChainActionToPendingTransaction(hash as `0x${string}`, onchainAction);
			pending_transactions.push(tx);
			if (onchainAction.revealTx) {
				const tx = {
					hash: onchainAction.revealTx.hash,
					request: onchainAction.revealTx.request,
					final: onchainAction.revealTx.final,
					inclusion: onchainAction.revealTx.inclusion,
					status: onchainAction.revealTx.status,
				} as PendingTransaction;
				pending_transactions.push(tx);
			}
		}
		emitter.emit({name: 'newTx', txs: pending_transactions});
	}

	async function unload() {
		//save before unload
		await save();

		// delete all
		for (const hash of Object.keys($onchainActions)) {
			delete ($onchainActions as any)[hash];
		}
		onchainActions.set($onchainActions);

		$offchainState.moves = [];
		$offchainState.epoch = undefined;
		$offchainState.lastEpochAcknowledged = 0;
		offchainState.set($offchainState);

		emitter.emit({name: 'clear'});
	}

	async function save() {
		_save({
			onchainActions: $onchainActions,
			offchainState: $offchainState,
		});
	}

	async function _load(address: `0x${string}`, chainId: string, genesisHash?: string): Promise<AccountData> {
		key = `account_${address}_${chainId}_${genesisHash}`;
		let dataSTR: string | undefined | null;
		try {
			dataSTR = localStorage.getItem(key);
		} catch {}
		const data: AccountData = dataSTR ? JSON.parse(dataSTR, bnReviver) : emptyAccountData;
		return data;
	}

	async function _save(accountData: AccountData) {
		if (key) {
			logger.info(`saving account data`);
			localStorage.setItem(key, JSON.stringify(accountData, bnReplacer));
		}
	}

	function addAction(tx: EIP1193TransactionWithMetadata, hash: `0x${string}`, inclusion?: 'Broadcasted') {
		if (!tx.metadata) {
			console.error(`no metadata on the tx, we still save it, but this will not let us know what this tx is about`);
		} else if (typeof tx.metadata !== 'object') {
			console.error(`metadata is not an object and so do not conform to DungeonTransaction`);
		} else {
			if (!('type' in tx.metadata)) {
				console.error(`no field "type" in the metadata and so do not conform to DungeonTransaction`);
			}
		}

		if (tx.metadata && (tx.metadata as any).type === 'reveal') {
			const data: RevealMetadata = tx.metadata as RevealMetadata;
			const action = $onchainActions[data.commitTx];
			const pendingTransaction = {
				hash,
				request: tx,
				inclusion: inclusion || 'BeingFetched',
				final: undefined,
				status: undefined,
			} as PendingTransaction;
			if (action) {
				action.revealTx = pendingTransaction;
			}
			save();
			onchainActions.set($onchainActions);

			emitter.emit({
				name: 'newTx',
				txs: [pendingTransaction],
			});
			return;
		}

		const onchainAction: OnChainAction = {
			tx: tx as StratagemsTransaction,
			inclusion: inclusion || 'BeingFetched',
			final: undefined,
			status: undefined,
		};

		$onchainActions[hash] = onchainAction;
		save();
		onchainActions.set($onchainActions);

		emitter.emit({
			name: 'newTx',
			txs: [fromOnChainActionToPendingTransaction(hash, onchainAction)],
		});
	}

	function _updateTx(pendingTransaction: PendingTransaction) {
		if (pendingTransaction.request.metadata && pendingTransaction.request.metadata.type === 'reveal') {
			const action = $onchainActions[pendingTransaction.request.metadata.commitTx];
			if (action) {
				action.revealTx = {...pendingTransaction};
				if (action.revealTx.final) {
					delete $onchainActions[pendingTransaction.request.metadata.commitTx];
				}
			}
		} else {
			const action = $onchainActions[pendingTransaction.hash];
			if (action) {
				action.inclusion = pendingTransaction.inclusion;
				action.status = pendingTransaction.status;
				action.final = pendingTransaction.final;
			}
		}
	}

	function updateTx(pendingTransaction: PendingTransaction) {
		_updateTx(pendingTransaction);
		onchainActions.set($onchainActions);
		save();
	}

	function updateTxs(pendingTransactions: PendingTransaction[]) {
		for (const p of pendingTransactions) {
			_updateTx(p);
		}
		onchainActions.set($onchainActions);
		save();
	}

	// use with caution
	async function _reset() {
		await unload();
		if (key) {
			localStorage.removeItem(key);
		}
	}

	function resetOffchainState(alsoSave: boolean = true) {
		$offchainState.moves = undefined;

		$offchainState.epoch = undefined;
		if (alsoSave) {
			save();
		}
		offchainState.set($offchainState);
	}

	function addMove(move: LocalMove) {
		const existingMove = $offchainState.moves?.find((v) => v.x === move.x && v.y === move.y);
		if (!existingMove) {
			if (!$offchainState.moves) {
				$offchainState.moves = [];
			}
			$offchainState.moves.push(move);
		} else {
			existingMove.color = move.color;
		}

		save();
		offchainState.set($offchainState);
	}

	function removeMove(x: number, y: number) {
		if ($offchainState.moves) {
			for (let i = 0; i < $offchainState.moves.length; i++) {
				const move = $offchainState.moves[i];
				if (move.x === x && move.y === y) {
					$offchainState.moves.splice(i, 1);
					i--;
				}
			}
			save();
			offchainState.set($offchainState);
		}
	}

	function back() {
		// TODO undo
		// $offchainState.moves.splice($offchainState.moves.length - 1, 1);
		// save();
		// offchainState.set($offchainState);
	}

	function acknowledgeEpoch(epochNumber: number) {
		$offchainState.lastEpochAcknowledged = epochNumber;
		save();
		offchainState.set($offchainState);
	}

	return {
		$onchainActions,
		onchainActions: {
			subscribe: onchainActions.subscribe,
		},

		$offchainState,
		offchainState: {
			subscribe: offchainState.subscribe,
			// back,
			addMove,
			removeMove,
			reset: resetOffchainState,
			acknowledgeEpoch,
		},

		load,
		unload,
		updateTx,
		updateTxs,

		onTxSent(tx: EIP1193TransactionWithMetadata, hash: `0x${string}`) {
			addAction(tx, hash, 'Broadcasted');
			save();
		},

		on: emitter.on,
		off: emitter.off,

		_reset,
	};
}

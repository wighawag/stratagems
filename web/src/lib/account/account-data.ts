import type {PendingTransaction, EIP1193TransactionWithMetadata} from 'ethereum-tx-observer';
import {BaseAccountHandler, type OnChainAction, type OnChainActions, type RevealMetadata} from './base';
import {mainnetClient, createClient} from '$lib/fuzd';
import type {AccountInfo, SyncInfo} from './types';
import {FUZD_URI} from '$lib/config';
import {xyToBigIntID, type Color, type ContractMove} from 'stratagems-common';
import {writable, type Readable, type Writable} from 'svelte/store';
import {time} from '$lib/time';
import type {ScheduleInfo} from 'fuzd-scheduler';

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

export type CommitMetadata = {
	type: 'commit';
	epoch: number;
	localMoves: LocalMoves;
	secret: `0x${string}`;
	fuzd: boolean | 'pendingTx'; // TODO
};

export type StratagemsMetadata = {
	epoch: {
		hash: `0x${string}`;
		number: number;
	};
} & (CommitMetadata | RevealMetadata);

export type StratagemsTransaction = EIP1193TransactionWithMetadata<StratagemsMetadata>;

export type Epoch = {number: number};

export type OffchainState = {
	timestamp: number;
	epoch?: Epoch;
	lastEpochAcknowledged: number;
	moves?: LocalMoves;
};

export type AccountData = {
	onchainActions: OnChainActions<StratagemsMetadata>;
	offchainState: OffchainState;
};

function fromOnChainActionToPendingTransaction(
	hash: `0x${string}`,
	onchainAction: OnChainAction<StratagemsMetadata>,
): PendingTransaction {
	return {
		hash,
		request: onchainAction.tx,
		final: onchainAction.final,
		inclusion: onchainAction.inclusion,
		status: onchainAction.status,
	} as PendingTransaction;
}

function defaultData() {
	return {
		onchainActions: {},
		offchainState: {
			timestamp: 0,
			moves: undefined,
			lastEpochAcknowledged: 0,
		},
	};
}

export class StratagemsAccountData extends BaseAccountHandler<AccountData, StratagemsMetadata> {
	fuzdClient: ReturnType<typeof createClient> | undefined;

	private _offchainState: Writable<OffchainState>;
	public readonly offchainState: Readable<OffchainState>;

	constructor() {
		super('jolly-roger', defaultData, fromOnChainActionToPendingTransaction);

		this._offchainState = writable(this.$data.offchainState);
		this.offchainState = {
			subscribe: this._offchainState.subscribe,
		};
	}

	get $offchainState() {
		return this.$data.offchainState;
	}

	async load(info: AccountInfo, syncInfo?: SyncInfo): Promise<void> {
		if (FUZD_URI) {
			if (!info.localKey) {
				throw new Error(`no local key, FUZD requires it`);
			}
			this.fuzdClient = createClient({
				drand: mainnetClient(),
				privateKey: info.localKey,
				schedulerEndPoint: FUZD_URI,
			});
		}
		return super.load(info, syncInfo);
	}

	async unload() {
		this.fuzdClient = undefined;
		const result = await super.unload();
		// TODO make it an abstract notifyUnload
		this._offchainState.set(this.$data.offchainState);
		return result;
	}

	_merge(
		localData?: AccountData | undefined,
		remoteData?: AccountData | undefined,
	): {newData: AccountData; newDataOnLocal: boolean; newDataOnRemote: boolean} {
		let newDataOnLocal = false;
		let newDataOnRemote = false;
		let newData = localData;

		if (!newData) {
			newData = defaultData();
		} else {
			newDataOnLocal = true;
		}

		// hmm check if valid
		if (!remoteData || !remoteData.onchainActions || !remoteData.offchainState) {
			remoteData = defaultData();
		}

		for (const key of Object.keys(newData.onchainActions)) {
			const txHash = key as `0x${string}`;

			const remoteAction = remoteData.onchainActions[txHash];
			const localAction = newData.onchainActions[txHash];
			if (remoteAction) {
				if (remoteAction.fuzd) {
					if (remoteAction.fuzd.timestamp > (localAction.fuzd?.timestamp || 0)) {
						localAction.fuzd = remoteAction.fuzd;
						newDataOnRemote = true;
					}
				}
				if (remoteAction.revealTx && !localAction.revealTx) {
					localAction.revealTx = remoteAction.revealTx;
					newDataOnRemote = true;
				}
			}
		}

		for (const key of Object.keys(remoteData.onchainActions)) {
			const txHash = key as `0x${string}`;
			if (!newData.onchainActions[txHash]) {
				newData.onchainActions[txHash] = remoteData.onchainActions[txHash];
				newDataOnRemote = true;
			}
		}

		if (remoteData.offchainState.timestamp > newData.offchainState.timestamp) {
			newData.offchainState = remoteData.offchainState;
			newDataOnRemote = true;
		} else if (newData.offchainState.timestamp > remoteData.offchainState.timestamp) {
			newDataOnLocal = true;
		}

		return {
			newData,
			newDataOnLocal,
			newDataOnRemote,
		};
	}

	async getFuzd() {
		if (!this.fuzdClient) {
			throw new Error(`no fuzd client setup`);
		}
		const remoteAccount = await this.fuzdClient.getRemoteAccount();
		const self = this;
		return {
			remoteAccount,
			scheduleExecution(
				execution: {
					slot: string;
					chainId: string;
					gas: bigint;
					broadcastSchedule: [{duration: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint}];
					data: `0x${string}`;
					to: `0x${string}`;
					time: number;
				},
				options?: {fakeEncrypt?: boolean},
			) {
				if (!self.fuzdClient) {
					throw new Error(`no fuzd client setup`);
				}
				return self.fuzdClient.scheduleExecution(execution, options);
			},
		};
	}

	resetOffchainState(alsoSave: boolean = true) {
		this.$data.offchainState.moves = undefined;
		this.$data.offchainState.timestamp = time.now;

		this.$data.offchainState.epoch = undefined;
		if (alsoSave) {
			this._save();
		}
		this._offchainState.set(this.$data.offchainState);
	}

	addMove(move: LocalMove) {
		const existingMove = this.$data.offchainState.moves?.find((v) => v.x === move.x && v.y === move.y);
		if (!existingMove) {
			if (!this.$data.offchainState.moves) {
				this.$data.offchainState.moves = [];
			}
			this.$data.offchainState.moves.push(move);
			this.$data.offchainState.timestamp = time.now;
		} else {
			existingMove.color = move.color;
		}

		this._save();
		this._offchainState.set(this.$data.offchainState);
	}

	removeMove(x: number, y: number) {
		if (this.$data.offchainState.moves) {
			for (let i = 0; i < this.$data.offchainState.moves.length; i++) {
				const move = this.$data.offchainState.moves[i];
				if (move.x === x && move.y === y) {
					this.$data.offchainState.moves.splice(i, 1);
					i--;
				}
			}
			this.$data.offchainState.timestamp = time.now;
			this._save();
			this._offchainState.set(this.$data.offchainState);
		}
	}

	back() {
		// TODO undo
		// $offchainState.moves.splice($offchainState.moves.length - 1, 1);
		// $offchainState.timestamp = time.now;
		// save();
		// offchainState.set($offchainState);
	}

	acknowledgeEpoch(epochNumber: number) {
		this.$data.offchainState.lastEpochAcknowledged = epochNumber;
		this.$data.offchainState.timestamp = time.now;
		this._save();
		this._offchainState.set(this.$data.offchainState);
	}

	recordFUZD(hash: `0x${string}`, data: ScheduleInfo) {
		// TODO ensure timestamp synced ?
		const timestamp = time.now;
		const onchainAction = this.$data.onchainActions[hash];
		if (!onchainAction) {
			throw new Error(`Cannot find onchainAction with hash: ${hash}`);
		}
		if (onchainAction.tx.metadata?.type === 'commit') {
			for (const key of Object.keys(this.$data.onchainActions)) {
				const action = this.$data.onchainActions[key as `0x${string}`];
				if (
					typeof action.fuzd?.state === 'object' &&
					action.fuzd.state.account === data.account &&
					action.fuzd.state.chainId === data.chainId &&
					action.fuzd.state.slot === data.slot
				) {
					action.fuzd = {timestamp, state: 'replaced'};
				}
			}
			onchainAction.fuzd = {timestamp, state: data};

			this._save();
			this._onchainActions.set(this.$data.onchainActions);
		} else {
			throw new Error(`Action is not of type "commit"`);
		}
	}
}

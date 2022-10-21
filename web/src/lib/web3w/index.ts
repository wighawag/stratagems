import type {Readable} from 'sveltore';
import {
	createFlowStore,
	setupWriteableWithState,
	stateEquals,
	type StateData,
	type StoreWithErrors,
} from './utils/stores';

export type WalletData = StateData<'Idle' | 'Locked' | 'Ready'> & {
	address?: string;
};
export type WalletActions = {
	connect(discrete?: boolean): Promise<void>;
};
export type WalletStore = WalletActions & StoreWithErrors<WalletData>;

function createWalletStore(options?: {autoConnect?: boolean}): WalletStore {
	const lastAddress = localStorage.getItem('_wallet_lastAddress');

	const {assign, subscribe, _data, acknowledgeError, transitioningTo, setState} = setupWriteableWithState<
		WalletData['state'],
		Exclude<WalletData, WalletData['state']>
	>({
		state: 'Idle',
		address: lastAddress,
	});

	const ethereum = (window as any).ethereum;

	const connect = async (discrete = false) => {
		let accounts;

		if (!ethereum) {
			if (discrete) {
				return;
			} else {
				assign({
					error: {
						code: 5000,
						message: 'No Ethereum Wallet Found',
						title: 'Wallet Connection Error',
					},
				});
				return;
			}
		}

		try {
			accounts = await ethereum.request({
				method: 'eth_accounts',
				params: [],
			});
		} catch (e) {}

		if (!accounts || accounts.length === 0) {
			if (discrete) {
				setState(_data.address ? 'Locked' : _data.state);
				return;
			}

			if (_data.address) {
				setState('Locked');
			}

			accounts = await ethereum.request({
				method: 'eth_requestAccounts',
				params: [],
			});
		}

		const owner = accounts[0];
		if (owner) {
			assign({
				transitioning: undefined,
				address: owner,
			});
			localStorage.setItem('_wallet_lastAddress', owner);
		} else {
			assign({
				transitioning: undefined,
			});
		}
	};

	if (ethereum) {
		ethereum.on('accountsChanged', (accounts: string[]) => {
			if (accounts[0] && accounts[0].toLowerCase() !== _data.address?.toLowerCase()) {
				assign({
					address: accounts[0],
				});
			}
		});
	}

	if (options?.autoConnect) {
		connect(true);
	}
	return {
		subscribe,
		connect,
		acknowledgeError,
	};
}

export type WalletFlowData = StateData<'Idle' | 'SettingUp' | 'Executing'> & {
	promise?: Promise<any>;
};
export type WalletFlowActions = {
	execute<T>(func: ($wallet: WalletData) => T): Promise<T>;
};
export type WalletFlowStore = Readable<WalletFlowData> & WalletFlowActions;

export function createWalletStores(options?: {autoConnect?: boolean}) {
	const wallet = createWalletStore(options);
	const flow = createFlowStore(wallet, stateEquals('Ready'), async (walletStore) => {
		await walletStore.connect(false);
	});
	return {wallet, flow};
}

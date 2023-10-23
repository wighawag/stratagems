import {accountData} from '$lib/web3';
import type {OnChainAction, OnChainActions} from '$lib/web3/account-data';
import {writable, type Readable} from 'svelte/store';

export type TxExecution = {waitingSigning: boolean; sent: boolean; error?: any; action?: OnChainAction};
export function createTxExecutor<T, F extends (...args: any[]) => Promise<undefined | `0x${string}`>>(
	func: F,
): Readable<TxExecution> & {
	execute: F;
	acknowledgeError: () => void;
} {
	let txHash: `0x${string}` | undefined;
	let action: OnChainAction | undefined;
	let lastOnchainActions: OnChainActions | undefined;

	function updateAction(hash: `0x${string}` | undefined) {
		if (!hash) {
			action = undefined;
		} else if (lastOnchainActions) {
			action = lastOnchainActions[hash];
			executing.set({waitingSigning: false, sent: true, error: undefined, action});
		}
	}

	const executing = writable<TxExecution>({waitingSigning: false, sent: false}, (set) => {
		const unsubscribe = accountData.onchainActions.subscribe(($onchainActions) => {
			lastOnchainActions = $onchainActions;
			updateAction(txHash);
		});
		return () => {
			lastOnchainActions = undefined;
			unsubscribe();
		};
	});

	const execute = ((...args: any[]) => {
		executing.set({waitingSigning: true, sent: false, error: undefined});
		return func(...args)
			.then((hash) => {
				txHash = hash;
				updateAction(txHash);
				try {
					executing.set({waitingSigning: false, sent: true});
				} catch {}
				return hash;
			})
			.catch((err) => {
				try {
					executing.set({waitingSigning: false, sent: false, error: err});
				} catch {}
				throw err;
			});
	}) as F;

	return {
		subscribe: executing.subscribe,
		acknowledgeError() {
			executing.set({waitingSigning: false, sent: false, error: undefined, action: undefined});
		},
		execute,
	};
}

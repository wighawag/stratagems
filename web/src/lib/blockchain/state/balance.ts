import {blockTime} from '$lib/config';
import type {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {writable, type Readable} from 'svelte/store';
import {zeroAddress, type Address, encodeFunctionData} from 'viem';
import type {AccountState, ConnectionState} from 'web3-connection';

export type BalanceData = {state: 'Idle' | 'Loaded'; fetching: boolean; balance: bigint; account?: Address};

export function initBalance(
	token: Address,
	connection: Readable<ConnectionState>,
	account: Readable<AccountState<Address>>,
) {
	const $state: BalanceData = {state: 'Idle', fetching: false, balance: 0n};

	let cancelAccountSubscription: (() => void) | undefined = undefined;
	let cancelConnectionSubscription: (() => void) | undefined = undefined;
	function stop() {
		if (cancelAccountSubscription) {
			cancelAccountSubscription();
			cancelAccountSubscription = undefined;
		}
		if (cancelConnectionSubscription) {
			cancelConnectionSubscription();
			cancelConnectionSubscription = undefined;
		}
	}

	let provider: EIP1193ProviderWithoutEvents | undefined;

	async function fetchBalance(account: Address) {
		if ($state.account !== account) {
			return;
		}
		if (provider) {
			$state.fetching = true;
			store.set($state);
			try {
				let balance: string;
				if (token === zeroAddress) {
					balance = await provider.request({method: 'eth_getBalance', params: [account]});
				} else {
					balance = await provider.request({
						method: 'eth_call',
						params: [
							{
								to: token,
								data: encodeFunctionData({
									abi: [
										{type: 'function', name: 'balanceOf', inputs: [{type: 'address'}], outputs: [{type: 'uint56'}]},
									],
									args: [account],
									functionName: 'balanceOf',
								}),
							},
						],
					});
				}

				if ($state.account !== account) {
					return;
				}
				$state.balance = BigInt(balance);
				$state.state = 'Loaded';
				$state.fetching = false;
				store.set($state);
			} catch (e: any) {
				console.error(e);
				$state.fetching = false;
				store.set($state);
			} finally {
				// we keep fetching
				// TODO use chain tempo
				setTimeout(() => fetchBalance(account), blockTime * 1000);
			}
		}
	}

	function start(set: (data: BalanceData) => void) {
		cancelAccountSubscription = account.subscribe(($account) => {
			if ($state.account !== $account.address) {
				$state.account = $account.address;
				$state.state = 'Idle';
				store.set($state);
				if ($account.address) {
					fetchBalance($account.address);
				}
			}
		});

		cancelConnectionSubscription = connection.subscribe(($connection) => {
			if (provider !== $connection.provider) {
				provider = $connection.provider;
				if ($state.account) {
					fetchBalance($state.account);
				}
			}
		});

		return stop;
	}

	const store = writable($state, start);

	return {
		subscribe: store.subscribe,
	};
}

import {blockTime, initialContractsInfos} from '$lib/config';
import type {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {writable, type Readable} from 'svelte/store';
import {zeroAddress, type Address, encodeFunctionData} from 'viem';
import type {AccountState, ConnectionState} from 'web3-connection';
import {connection, account} from '$lib/blockchain/connection';

export type BalanceData = {
	state: 'Idle' | 'Loaded';
	fetching: boolean;
	tokenBalance: bigint;
	tokenAllowance: bigint;
	nativeBalance: bigint;
	reserve: bigint;
	account?: Address;
};

export function initBalance({
	token,
	connection,
	account,
	depositContract,
}: {
	token: Address;
	connection: Readable<ConnectionState>;
	account: Readable<AccountState<Address>>;
	depositContract?: Address;
}) {
	const $state: BalanceData = {state: 'Idle', fetching: false, tokenBalance: 0n, tokenAllowance: 0n, nativeBalance: 0n, reserve: 0n};

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
				let reserve: string = '0x0';
				if (depositContract) {
					reserve = await provider.request({
						method: 'eth_call',
						params: [
							{
								to: depositContract,
								data: encodeFunctionData({
									abi: [
										{
											type: 'function',
											name: 'getTokensInReserve',
											inputs: [{type: 'address'}],
											outputs: [{type: 'uint56'}],
										},
									],
									args: [account],
									functionName: 'getTokensInReserve',
								}),
							},
						],
					});
				}
				const nativeBalance = await provider.request({method: 'eth_getBalance', params: [account]});

				let tokenBalance: string;
				let tokenAllowance: string = "0";
				if (token === zeroAddress) {
					tokenBalance = nativeBalance; // TODO do not do this ? or rename tokenBalance to gameBalance or something ?
				} else {
					tokenBalance = await provider.request({
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
					tokenAllowance = await provider.request({
						method: 'eth_call',
						params: [
							{
								to: token,
								data: encodeFunctionData({
									abi: [
										{type: 'function', name: 'allowance', inputs: [{type: 'address'},{type: 'address'}], outputs: [{type: 'uint56'}]},
									],
									args: [account, depositContract],
									functionName: 'allowance',
								}),
							},
						],
					});
					console.log({tokenAllowance, account, depositContract})
				}

				if ($state.account !== account) {
					return;
				}
				$state.tokenBalance = BigInt(tokenBalance);
				$state.tokenAllowance = BigInt(tokenAllowance);
				$state.nativeBalance = BigInt(nativeBalance);
				$state.reserve = BigInt(reserve);
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
				$state.nativeBalance = 0n;
				$state.tokenBalance = 0n;
				$state.tokenAllowance = 0n;
				$state.reserve = 0n;
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


export const balance = initBalance({
	token: initialContractsInfos.contracts.TestTokens.address,
	connection,
	account,
	depositContract: initialContractsInfos.contracts.Stratagems.address,
});

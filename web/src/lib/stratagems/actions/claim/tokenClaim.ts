import {hashParams, initialContractsInfos} from '$lib/config';
import {formatError} from '$utils/debug';
import {getRoughGasPriceEstimate} from '$utils/ethereum/gas';
import {rebuildLocationHash} from '$utils/url';
import {account, connection, viemClient, network} from '$lib/blockchain/connection';
import {derived, writable} from 'svelte/store';
import {decodeFunctionResult, encodeFunctionData, formatEther, parseEther} from 'viem';
import {privateKeyToAccount, type Account} from 'viem/accounts';
import {viemify} from 'web3-connection-viem';
import {getBalance, getTransactionCount, waitForTransactionReceipt} from 'viem/actions';

type TokenClaim = {
	inUrl: boolean;
	state:
		| 'Loading'
		| 'Available'
		| 'SettingUpClaim'
		| 'Claiming'
		| 'Claimed'
		| 'AlreadyClaimed'
		| 'AlreadyClaimedAnother';
	error?: unknown;
	txHash?: string;
};

const web3Connection = derived([connection, network, account], ([$connection, $network, $account]) => {
	if ($connection.state === 'Connected' && $account.state === 'Connected' && $network.state === 'Connected') {
		return viemify({connection: $connection, network: $network, account: $account});
	} else {
		return undefined;
	}
});

const state: TokenClaim = {
	inUrl: !!hashParams.tokenClaim,
	state: 'Loading',
};
const tokenClaimStore = writable(state, (set) => {
	if (!state.inUrl) {
		// we skip the listening entirely
		return () => {};
	}
	return web3Connection.subscribe(async ($web3Connection) => {
		if (!state.inUrl) {
			return;
		}

		if (!$web3Connection) {
			return;
		}

		let claimWallet;
		try {
			claimWallet = getClaimtWallet();
		} catch (e) {
			state.error = formatError(e);
			set(state);
			return;
		}

		const TestTokens = $web3Connection.network.contracts.TestTokens;
		const balance = await $web3Connection.client.public.readContract({
			...TestTokens,
			functionName: 'balanceOf',
			args: [claimWallet.address],
		});

		if (balance === 0n) {
			state.state = 'AlreadyClaimed';
			set(state);
		} else {
			state.state = 'Available';
			set(state);
		}
	});
});

function acknowledgeError() {
	state.error = undefined;
	tokenClaimStore.set(state);
}

function clearURL(): void {
	delete hashParams.tokenClaim;
	rebuildLocationHash(hashParams);

	state.inUrl = false;
	tokenClaimStore.set(state);
}

function getClaimtWallet(): Account {
	const account = privateKeyToAccount(hashParams.tokenClaim as `0x${string}`);
	console.log({claimAddress: account.address});
	return account;
}

async function claim() {
	state.state = 'SettingUpClaim';
	tokenClaimStore.set(state);

	const claimWallet = getClaimtWallet();

	viemClient.execute(async ({client, account, connection, network}) => {
		const TestTokens = network.contracts.TestTokens;
		// ----------------------------------------------------------------------------------------
		// Fetch Balances and Nonce
		// ----------------------------------------------------------------------------------------
		let ethBalance: bigint;
		let tokenBalance: bigint;
		let nonce: number;
		try {
			ethBalance = await getBalance(client.public, claimWallet);
			tokenBalance = await client.public.readContract({
				...TestTokens,
				functionName: 'balanceOf',
				args: [claimWallet.address],
			});
			if (tokenBalance == 0n) {
				throw new Error(`Already Claimed`);
			}
			nonce = await getTransactionCount(client.public, {address: claimWallet.address, blockTag: 'latest'});
		} catch (err) {
			console.error(`ERROR getting claim info`, err);
			state.error = formatError(err);
			// TODO use previous state instead of 'Available'
			state.state = 'Available';
			tokenClaimStore.set(state);
			throw err;
		}
		// ----------------------------------------------------------------------------------------

		// ----------------------------------------------------------------------------------------
		// Construct the Transaction Data with fake value = 1
		// ----------------------------------------------------------------------------------------
		const redeemTransactionData = {
			...TestTokens,
			functionName: 'transferAlongWithETH',
			args: [account.address, tokenBalance],
			account: claimWallet,
			value: 1n,
		} as const;
		// ----------------------------------------------------------------------------------------

		// ----------------------------------------------------------------------------------------
		// Fetch the basic estimate
		// ----------------------------------------------------------------------------------------
		let basicEstimate: bigint;
		try {
			basicEstimate = await client.public.estimateContractGas(redeemTransactionData);
		} catch (err) {
			console.error(`ERROR estimating call`, err);
			state.error = formatError(err);
			// TODO use previous state instead of 'Available'
			state.state = 'Available';
			tokenClaimStore.set(state);
			throw err;
		}
		const estimate = basicEstimate + 10000n; // add a buffer
		// ----------------------------------------------------------------------------------------

		// ----------------------------------------------------------------------------------------
		// Gather the various fees and gas prices
		// ----------------------------------------------------------------------------------------
		let {maxFeePerGas, maxPriorityFeePerGas, gasPrice} = await client.public.estimateFeesPerGas({
			type: 'eip1559',
		});
		let extraFee = 0n;
		if (!maxFeePerGas) {
			if (gasPrice) {
				maxFeePerGas = gasPrice;
				maxPriorityFeePerGas = gasPrice;
			} else {
				const errorMessage = `could not fetch gasPrice`;
				console.error(errorMessage);
				state.error = errorMessage;
				// TODO use previous state instead of 'Available'
				state.state = 'Available';
				tokenClaimStore.set(state);
				throw new Error(errorMessage);
			}
		} else {
			if (!maxPriorityFeePerGas) {
				maxPriorityFeePerGas = 1000000n;
			}
		}
		if ('estimateContractL1Fee' in client.public) {
			const l1Fee = await client.public.estimateContractL1Fee(redeemTransactionData);
			// const l1BaseFee = await client.public.getL1BaseFee();
			// const gasPlusFactorsForL1 = (l1Fee / l1BaseFee) + 1;
			// const updatedL1Fee = gasPlusFactorsForL1 * highBaseFee;

			extraFee = l1Fee;
		}
		// ----------------------------------------------------------------------------------------

		const ethLeft = ethBalance - estimate * maxFeePerGas - extraFee;
		let txHash: `0x${string}` | undefined;
		try {
			const txData = encodeFunctionData({
				...TestTokens,
				functionName: 'transferAlongWithETH',
				args: [account.address, tokenBalance],
			});

			const rawTx = await client.wallet.signTransaction({
				to: TestTokens.address,
				account: claimWallet,
				value: ethLeft,
				nonce,
				maxFeePerGas,
				maxPriorityFeePerGas,
				gas: estimate,
				data: txData,
			});

			// TODO investigate: coinbase wallet do not seem to allow eth_sendRawTransaction
			const provider = connection.httpProvider || connection.provider;

			txHash = await provider.request({
				method: 'eth_sendRawTransaction',
				params: [rawTx],
			});

			// txHash = await client.wallet.writeContract({
			// 	...redeemTransactionData,
			// 	value: ethLeft,
			// 	nonce,
			// 	maxFeePerGas,
			// 	maxPriorityFeePerGas,
			// 	account: claimWallet,
			// 	gas: estimate,
			// });

			state.state = 'Claiming';
			tokenClaimStore.set(state);
		} catch (e) {
			// TODO use previous state instead of 'Available'
			state.error = formatError(e);
			state.state = 'Available';
			tokenClaimStore.set(state);
			console.error(e);
		}
		if (txHash) {
			state.txHash = txHash;
			tokenClaimStore.set(state);
			try {
				await waitForTransactionReceipt(client.public, {hash: txHash});
				state.state = 'Claimed';
				tokenClaimStore.set(state);
			} catch (e) {
				state.error = formatError(e);
				tokenClaimStore.set(state);
				console.error(e);
			}
		}
	});
}

export default {
	subscribe: tokenClaimStore.subscribe,
	acknowledgeError,
	clearURL,
	claim,
};

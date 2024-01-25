import {hashParams} from '$lib/config';
import {formatError} from '$utils/debug';
import {estimateGasPrice} from '$utils/eth/gas';
import {rebuildLocationHash} from '$utils/url';
import {account, connection, contracts, network} from '$lib/blockchain/connection';
import {derived, writable} from 'svelte/store';
import {formatEther} from 'viem';
import {privateKeyToAccount, type Account} from 'viem/accounts';
import {viemify} from 'web3-connection-viem';
import { getBalance, getTransactionCount, waitForTransactionReceipt } from 'viem/actions';

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

		const TestTokens = $web3Connection.contracts.TestTokens;
		const balance = await TestTokens.read.balanceOf([claimWallet.address]);

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

	contracts.execute(async ({contracts, client, account, connection}) => {
		let ethBalance: bigint;
		let tokenBalance: bigint;
		let nonce: number;
		let estimate: bigint;
		try {
			ethBalance = await getBalance(client.public, claimWallet);
			tokenBalance = await contracts.TestTokens.read.balanceOf([claimWallet.address]);
			if (tokenBalance == 0n) {
				// TODO
			}
			nonce = await getTransactionCount(client.public, {address: claimWallet.address, blockTag: 'latest'});
			estimate = await contracts.TestTokens.estimateGas.transferAlongWithETH([account.address, tokenBalance], {
				account: claimWallet,
				value: 1n,
				nonce,
			});
		} catch (e) {
			console.log(`ERROR getting info`, e);
			// TODO use previous state instead of 'Available'
			state.error = formatError(e);
			state.state = 'Available';
			tokenClaimStore.set(state);
			throw e;
		}

		console.log({estimate, nonce, tokenBalance});

		const gasPriceEstimates = await estimateGasPrice(connection.provider);
		// we get the fast estimate
		const fast = gasPriceEstimates.fast;
		console.log(fast);
		// we then double the maxFeePerGas to accomodate for spikes
		const maxFeePerGas = fast.maxFeePerGas * 2n;
		const maxPriorityFeePerGas = fast.maxPriorityFeePerGas;
		const ethLeft = ethBalance - estimate * maxFeePerGas;
		console.log({ethLeft: formatEther(ethLeft)});
		let txHash;
		try {
			txHash = await contracts.TestTokens.write.transferAlongWithETH([account.address, tokenBalance], {
				value: ethLeft,
				nonce,
				maxFeePerGas,
				maxPriorityFeePerGas,
				account: claimWallet,
			});
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

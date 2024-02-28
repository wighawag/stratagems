import {hashParams, initialContractsInfos} from '$lib/config';
import {formatError} from '$utils/debug';
import {getRoughGasPriceEstimate} from '$utils/ethereum/gas';
import {rebuildLocationHash} from '$utils/url';
import {account, connection, contracts, network} from '$lib/blockchain/connection';
import {derived, writable} from 'svelte/store';
import {decodeFunctionResult, encodeFunctionData, formatEther, parseEther} from 'viem';
import {privateKeyToAccount, type Account} from 'viem/accounts';
import {viemify} from 'web3-connection-viem';
import {call, getBalance, getTransactionCount, waitForTransactionReceipt} from 'viem/actions';
import type {Web3ConnectionProvider} from 'web3-connection';

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

	contracts.execute(async ({contracts, client, account, connection, network}) => {
		// if (connection.httpProvider) {
		// 	console.log(`using http provider`);
		// 	const httpViem = viemify({
		// 		connection,
		// 		network,
		// 		account,
		// 		providerOverride: connection.httpProvider as Web3ConnectionProvider,
		// 	});
		// 	contracts = httpViem.contracts as any;
		// } else {
		// 	console.log(`using wallet provider`);
		// }

		let ethBalance: bigint;
		let tokenBalance: bigint;
		let nonce: number;
		let basicEstimate: bigint;
		try {
			ethBalance = await getBalance(client.public, claimWallet);
			tokenBalance = await contracts.TestTokens.read.balanceOf([claimWallet.address]);
			if (tokenBalance == 0n) {
				// TODO
			}
			nonce = await getTransactionCount(client.public, {address: claimWallet.address, blockTag: 'latest'});
			basicEstimate = await contracts.TestTokens.estimateGas.transferAlongWithETH([account.address, tokenBalance], {
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

		const isAncient8Networks =
			(initialContractsInfos as any).chainId == '888888888' || (initialContractsInfos as any).chainId == '28122024';

		const estimate = basicEstimate + 10000n; // we add 10000n in case
		console.log({estimate, basicEstimate, nonce, tokenBalance, ethBalance});

		const gasPriceEstimates = await getRoughGasPriceEstimate(connection.provider);
		// we get the fast estimate
		const fast = gasPriceEstimates.fast;
		let maxFeePerGasToUse = fast.maxFeePerGas;
		let maxPriorityFeePerGasToUse = fast.maxPriorityFeePerGas;

		let extraFee = 0n;
		// TODO if op
		const gasOracleABI = [
			{
				inputs: [{internalType: 'bytes', name: '_data', type: 'bytes'}],
				name: 'getL1Fee',
				outputs: [{internalType: 'uint256', name: '', type: 'uint256'}],
				stateMutability: 'view',
				type: 'function',
			},
		];

		const callData = encodeFunctionData({
			abi: contracts.TestTokens.abi,
			functionName: 'transferAlongWithETH',
			args: [account.address, tokenBalance],
		});

		const functionName = 'getL1Fee';
		const data = encodeFunctionData({
			abi: gasOracleABI,
			functionName,
			args: [callData],
		});
		try {
			const result = (await connection.provider.request({
				method: 'eth_call',
				params: [
					{
						to: '0x420000000000000000000000000000000000000F',
						data,
					},
				],
			})) as `0x${string}`;
			extraFee = decodeFunctionResult({
				abi: gasOracleABI,
				functionName,
				data: result,
			}) as bigint;

			extraFee *= 2n; // we multiply extraFee by 2 to ensure t goes through
		} catch (err) {
			console.error(err);
		}

		if (isAncient8Networks) {
			// TODO investigate: some issue with alpha1test in regardrd to gas
			if (maxPriorityFeePerGasToUse < gasPriceEstimates.gasPrice) {
				maxPriorityFeePerGasToUse = gasPriceEstimates.gasPrice;
				if (maxFeePerGasToUse < maxPriorityFeePerGasToUse) {
					maxFeePerGasToUse = maxPriorityFeePerGasToUse;
				}
			}
		}

		// // TODO per chain
		// const minimum = parseEther('1', 'gwei');
		// if (maxFeePerGasToUse < minimum) {
		// 	maxFeePerGasToUse = minimum;
		// 	// maxPriorityFeePerGasToUse = minimum;
		// }

		console.log(fast);
		// we then double the maxFeePerGas to accomodate for spikes
		const maxFeePerGas = maxFeePerGasToUse;
		const maxPriorityFeePerGasTmp = maxPriorityFeePerGasToUse === 0n ? 4n : maxPriorityFeePerGasToUse * 2n;
		const maxPriorityFeePerGas = maxPriorityFeePerGasTmp > maxFeePerGas ? maxFeePerGas : maxPriorityFeePerGasTmp;

		const ethLeft = ethBalance - estimate * maxFeePerGas - extraFee;
		console.log({gasCostinETH: formatEther(estimate * maxFeePerGas)});
		console.log({ethLeft: formatEther(ethLeft)});
		console.log({total: formatEther(estimate * maxFeePerGas + ethLeft)});
		console.log({maxFeePerGas: formatEther(maxFeePerGas)});
		console.log({maxPriorityFeePerGas: formatEther(maxPriorityFeePerGas)});
		console.log({extraFee: formatEther(extraFee)});
		let txHash;
		try {
			txHash = await contracts.TestTokens.write.transferAlongWithETH([account.address, tokenBalance], {
				value: ethLeft,
				nonce,
				maxFeePerGas,
				maxPriorityFeePerGas,
				account: claimWallet,
				gas: estimate,
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

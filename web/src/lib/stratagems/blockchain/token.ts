import {get} from 'svelte/store';
import {contractsInfos} from './networks';
import {connection} from './connection';

export async function addTokenToWallet() {
	const tokenAddress = get(contractsInfos).contracts.Stratagems.linkedData.tokens;
	const tokenSymbol = get(contractsInfos).contracts.Stratagems.linkedData.currency.symbol;
	const tokenDecimals = get(contractsInfos).contracts.Stratagems.linkedData.currency.decimals;
	const tokenImage = 'https://assets.etherplay.io/images/icons/two-golden-coins.png';

	try {
		// 'wasAdded' is a boolean. Like any RPC method, an error can be thrown.
		const wasAdded = await get(connection).provider?.request({
			method: 'wallet_watchAsset',
			params: {
				type: 'ERC20',
				options: {
					// The address of the token.
					address: tokenAddress,
					// A ticker symbol or shorthand, up to 5 characters.
					symbol: tokenSymbol,
					// The number of decimals in the token.
					decimals: tokenDecimals,
					// A string URL of the token logo.
					image: tokenImage,
				},
			} as any,
		});

		if (wasAdded) {
			console.log('Thanks for your interest!');
		} else {
			console.log('Ok');
		}
	} catch (error) {
		console.log(error);
	}
}

import {initWeb3W} from 'web3w';
import {contractsInfos} from '$app/blockchain/contracts';
import {webWalletURL, finality, fallbackProviderOrUrl, chainId, localDev} from '$app/config';
import {isCorrected, correctTime} from '$app/time';
import {chainTempo} from '$app/blockchain/chainTempo';
// import * as Sentry from '@sentry/browser';
import {get} from 'svelte/store';
import {getIPFSHash} from '$app/utils/web';
import {notifications} from '$app/web/notifications';

const walletStores = initWeb3W({
	chainConfigs: get(contractsInfos),
	builtin: {autoProbe: true},
	transactions: {
		autoDelete: false,
		finality,
	},
	flow: {
		autoUnlock: true,
	},
	autoSelectPrevious: true,
	localStoragePrefix: getIPFSHash(), // ensure local storage is not conflicting across web3w-based apps on ipfs gateways
	options: ['builtin'],
	fallbackNode: fallbackProviderOrUrl,
	checkGenesis: localDev,
});

export const {wallet, transactions, builtin, chain, balance, flow, fallback} = walletStores;

function notifyFailure(tx: {hash: string}) {
	notifications.queue({
		id: tx.hash,
		delay: 0,
		title: 'Transaction Error',
		text: 'The Transaction failed',
		type: 'error',
		onAcknowledge: () => transactions.acknowledge(tx.hash, 'failure'),
	});
}

function notifyCancelled(tx: {hash: string}) {
	notifications.queue({
		id: tx.hash,
		delay: 3,
		title: 'Transaction Cancelled',
		text: 'The Transaction Has Been Replaced',
		type: 'info',
		onAcknowledge: () => transactions.acknowledge(tx.hash, 'cancelled'),
	});
}

transactions.subscribe(($transactions) => {
	for (const tx of $transactions.concat()) {
		if (tx.confirmations > 0 && !tx.acknowledged) {
			if (tx.status === 'failure') {
				notifyFailure(tx);
			} else if (tx.status === 'cancelled') {
				notifyCancelled(tx);
			} else {
				// auto acknowledge
				transactions.acknowledge(tx.hash, tx.status);
			}
		}
	}
});

chain.subscribe(async (v) => {
	chainTempo.startOrUpdateProvider(wallet.provider);
	if (!isCorrected()) {
		if (v.state === 'Connected' || v.state === 'Ready') {
			const latestBlock = await wallet.provider?.getBlock('latest');
			if (latestBlock) {
				correctTime(latestBlock.timestamp);
			}
		}
	}
});

fallback.subscribe(async (v) => {
	if (!isCorrected()) {
		if (v.state === 'Connected' || v.state === 'Ready') {
			const latestBlock = await wallet.provider?.getBlock('latest');
			if (latestBlock) {
				correctTime(latestBlock.timestamp);
			}
		}
	}
});

// TODO Sentry
// let lastAddress: string | undefined;
// wallet.subscribe(async ($wallet) => {
// 	if (lastAddress !== $wallet.address) {
// 		lastAddress = $wallet.address;
// 		Sentry.setUser({address: $wallet.address});
// 	}
// });

// TODO remove
if (typeof window !== 'undefined') {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(window as any).walletStores = walletStores;
}

chainTempo.startOrUpdateProvider(wallet.provider);

contractsInfos.subscribe(async ($contractsInfo) => {
	await chain.updateContracts($contractsInfo);
});

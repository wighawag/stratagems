import {getDefaultProvider, Provider} from '@ethersproject/providers';
import {nameForChainId} from '$app/utils/eth/networks';
import {getParamsFromLocation, getHashParamsFromLocation} from '$app/utils/web';

let root = undefined;
if (typeof window !== 'undefined') {
	root = window.location.protocol + '//' + window.location.host + (window as any).BASE;
}
console.log(`VERSION: ${__VERSION__}`);

export const hashParams = getHashParamsFromLocation();
export const {params} = getParamsFromLocation();
// export const VERSION = '1';

const chainId = import.meta.env.VITE_CHAIN_ID as string;
let fallbackProviderOrUrl: string | Provider | undefined;
let finality = 12;
let blockTime = 15;
let nativeTokenSymbol = 'ETH';
if (chainId !== '1') {
	finality = 5; // TODO
	blockTime = 10;
	nativeTokenSymbol = 'ETH'; // TODO
}

if (chainId === '5') {
	finality = 8; // TODO
	blockTime = 15;
	nativeTokenSymbol = 'ETH';
}

let webWalletURL: string | undefined = import.meta.env.VITE_WEB_WALLET_ETH_NODE as string | undefined;

let localDev = false;
if (chainId === '1337' || chainId === '31337') {
	localDev = true;
	fallbackProviderOrUrl = import.meta.env.VITE_ETH_NODE_URI_LOCALHOST as string;
	webWalletURL = (import.meta.env.VITE_WEB_WALLET_ETH_NODE_LOCALHOST as string) || webWalletURL;

	// const localEthNode = import.meta.env.VITE_ETH_NODE_URI_LOCALHOST as string;
	// if (localEthNode && localEthNode !== '') {
	//   fallbackProviderOrUrl = localEthNode;
	// } else {
	//   fallbackProviderOrUrl = 'http://localhost:8545';
	// }
	finality = 2;
	blockTime = 5;
}

const chainName = nameForChainId(chainId);

if (!fallbackProviderOrUrl) {
	const url = import.meta.env.VITE_ETH_NODE_URI as string; // TODO use query string to specify it // TODO settings
	if (url && url !== '') {
		fallbackProviderOrUrl = url;
	}
}

if (fallbackProviderOrUrl && typeof fallbackProviderOrUrl === 'string') {
	if (!fallbackProviderOrUrl.startsWith('http') && !fallbackProviderOrUrl.startsWith('ws')) {
		// if no http nor ws protocol, assume fallbackProviderOrUrl is the network name
		// use ethers fallback provider
		fallbackProviderOrUrl = getDefaultProvider(fallbackProviderOrUrl, {
			alchemy: import.meta.env.VITE_ALCHEMY_API_KEY || undefined,
			etherscan: import.meta.env.VITE_ETHERSCAN_API_KEY || undefined,
			infura: import.meta.env.VITE_INFURA_PROJECT_ID || undefined,
			pocket: import.meta.env.VITE_POCKET_APP_ID || undefined,
			quorum: 2,
		});
	} else {
		fallbackProviderOrUrl = getDefaultProvider(fallbackProviderOrUrl); // still use fallback provider but use the url as is
	}
}

const logPeriod = 7 * 24 * 60 * 60;
const deletionDelay = 7 * 24 * 60 * 60;

const lowFrequencyFetch = blockTime * 8;
const mediumFrequencyFetch = blockTime * 4;
const highFrequencyFetch = blockTime * 2;

const globalQueryParams = ['debug', 'log', 'ethnode', '_d_eruda'];

export {
	finality,
	fallbackProviderOrUrl,
	webWalletURL,
	chainId,
	blockTime,
	chainName,
	nativeTokenSymbol,
	logPeriod,
	lowFrequencyFetch,
	mediumFrequencyFetch,
	highFrequencyFetch,
	globalQueryParams,
	deletionDelay,
	localDev,
};

if (typeof window !== 'undefined') {
	(window as any).env = import.meta.env;
}

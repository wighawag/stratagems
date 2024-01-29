import { derived, get, readable } from 'svelte/store';

import networks from '$data/networks.json';
import _contractsInfos from '$data/contracts';


export type NetworkConfig = typeof _contractsInfos;
export const initialContractsInfos = _contractsInfos;

let _setContractsInfos: any;
export const contractsInfos = readable<NetworkConfig>(_contractsInfos, (set) => {
	_setContractsInfos = set;
});

export function _asNewModule(set: any) {
	_setContractsInfos = set;
}

if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		newModule?._asNewModule(_setContractsInfos);
		_setContractsInfos(newModule?.initialContractsInfos);
	});
}



export type NetworkWalletData = {
	rpcUrls?: string[];
	blockExplorerUrls?: string[];
	chainName?: string;
	iconUrls?: string[];
	nativeCurrency?: {
		name: string;
		symbol: string;
		decimals: number;
	};
};
export type NetworkData = {
	config: NetworkWalletData;
	finality: number;
	averageBblockTime: number;
};

export function getNetworkConfig(chainId: string) {
	const network = (networks as any)[chainId] as NetworkData | undefined;
	return network?.config;
}

export {networks};


export const initialNetworkConfig = getNetworkConfig(initialContractsInfos.chainId);
export const initialNetworkName =  initialNetworkConfig?.chainName || `Chain with id: ${initialContractsInfos.chainId}`

export const contractNetwork = derived([contractsInfos], ([$contractsInfos]) => {
	const chainId = $contractsInfos.chainId;
	const config = getNetworkConfig(chainId);
	return {
		config,
		name: config?.chainName || `Chain with id: ${chainId}`,
		chainId
	}
})


import {derived, get, readable, type Readable} from 'svelte/store';
import type {ChainInfo} from '@rocketh/export';

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
	readonly rpcUrls?: readonly string[];
	readonly blockExplorerUrls?: readonly string[];
	readonly chainName?: string;
	readonly iconUrls?: readonly string[];
	readonly nativeCurrency?: {
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

export function getWalletSwitchChainInfo(chainInfo: ChainInfo): NetworkWalletData {
	return {
		rpcUrls: chainInfo.rpcUrls.default.http,
		blockExplorerUrls: chainInfo.blockExplorers?.default.url ? [chainInfo.blockExplorers?.default.url] : undefined,
		chainName: chainInfo.name,
		nativeCurrency: chainInfo.nativeCurrency,
	};
}

export const initialNetworkConfig = getWalletSwitchChainInfo(initialContractsInfos.chainInfo);
export const initialNetworkName = initialNetworkConfig?.chainName || `Chain with id: ${initialContractsInfos.chainId}`;

export const contractNetwork = derived([contractsInfos], ([$contractsInfos]) => {
	const chainId = $contractsInfos.chainId;
	const chainInfo = $contractsInfos.chainInfo;
	const config = getWalletSwitchChainInfo(chainInfo);
	return {
		config,
		name: config?.chainName || `Chain with id: ${chainId}`,
		chainId,
	};
});

// GameConfig parsed:
export type GameConfig = Omit<
	typeof initialContractsInfos.contracts.Stratagems.linkedData,
	'numTokensPerGems' | 'revealPhaseDuration' | 'commitPhaseDuration' | 'currency'
> & {
	numTokensPerGems: bigint;
	revealPhaseDuration: number;
	commitPhaseDuration: number;
	currency: {
		symbol: string;
		name: string;
		decimals: number;
	};
};
function transformGameConfig(data: typeof initialContractsInfos.contracts.Stratagems.linkedData) {
	const newValue = {
		...data,
		numTokensPerGems: BigInt(data.numTokensPerGems.slice(0, -1)),
		revealPhaseDuration: Number(data.revealPhaseDuration.slice(0, -1)),
		commitPhaseDuration: Number(data.revealPhaseDuration.slice(0, -1)),
		currency: {
			symbol: data.currency.symbol,
			name: data.currency.name,
			decimals: Number(data.currency.decimals),
		},
	};
	return newValue;
}
export const gameConfig: Readable<GameConfig> & {
	$current: GameConfig;
} = derived([contractsInfos], ([$contractsInfos]) => {
	const newValue = transformGameConfig($contractsInfos.contracts.Stratagems.linkedData);
	gameConfig.$current = newValue;
	return newValue;
}) as Readable<GameConfig> & {
	$current: GameConfig;
};
gameConfig.$current = transformGameConfig(initialContractsInfos.contracts.Stratagems.linkedData);

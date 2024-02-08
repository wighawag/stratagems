import {readable} from 'svelte/store';
import {version} from '$app/environment';
import {dev as devEnvironment} from '$app/environment';

import {getParamsFromLocation, getHashParamsFromLocation} from '$utils/url';
import {
	PUBLIC_ETH_NODE_URI_LOCALHOST,
	PUBLIC_ETH_NODE_URI,
	PUBLIC_LOCALHOST_BLOCK_TIME,
	PUBLIC_DEV_NODE_URI,
	PUBLIC_SYNC_URI,
	PUBLIC_FUZD_URI,
	PUBLIC_SNAPSHOT_URI,
} from '$env/static/public';
import {initialContractsInfos, networks, type NetworkConfig, contractsInfos} from './blockchain/networks';

export const globalQueryParams = ['debug', 'log', 'ethnode', '_d_eruda', 'dev', 'ethnode', 'sync', 'fuzd', 'snapshot'];

export const hashParams = getHashParamsFromLocation();
export const {params} = getParamsFromLocation();

export const dev = 'dev' in params ? params['dev'] === 'true' : devEnvironment;

function noEndSlash(str: string) {
	if (str.endsWith('/')) {
		return str.slice(0, -1);
	}
	return str;
}

const snapshotURI = params['snapshot'] || PUBLIC_SNAPSHOT_URI;
export const remoteIndexedState = snapshotURI ? `${noEndSlash(snapshotURI)}/${initialContractsInfos.name}/` : undefined;

const contractsChainId = initialContractsInfos.chainId as string;
let defaultRPCURL: string | undefined = params['ethnode'];

let blockTime: number = 15;

let isUsingLocalDevNetwork = false;
if (contractsChainId === '1337' || contractsChainId === '31337') {
	isUsingLocalDevNetwork = true;
	if (!defaultRPCURL) {
		const url = PUBLIC_ETH_NODE_URI_LOCALHOST as string;
		if (url && url !== '') {
			defaultRPCURL = url;
		}
	}
	blockTime = PUBLIC_LOCALHOST_BLOCK_TIME ? parseInt(PUBLIC_LOCALHOST_BLOCK_TIME) : blockTime;
}
if (!defaultRPCURL) {
	const url = PUBLIC_ETH_NODE_URI as string;
	if (url && url !== '') {
		defaultRPCURL = url;
	}
}

const localRPC =
	isUsingLocalDevNetwork && PUBLIC_DEV_NODE_URI ? {chainId: contractsChainId, url: PUBLIC_DEV_NODE_URI} : undefined;

const defaultRPC = defaultRPCURL ? {chainId: contractsChainId, url: defaultRPCURL} : undefined;

const SYNC_URI = params['sync'] || PUBLIC_SYNC_URI; //  'http://invalid.io'; // to emulate connection loss :)
const SYNC_DB_NAME =
	'stratagems-' + initialContractsInfos.chainId + '-' + initialContractsInfos.contracts.Stratagems.address;

const FUZD_URI = noEndSlash(params['fuzd'] ? (params['fuzd'] == 'false' ? '' : params['fuzd']) : PUBLIC_FUZD_URI);

const syncInfo = SYNC_URI
	? {
			uri: SYNC_URI,
		}
	: undefined;

const blockchainExplorer = networks[initialContractsInfos.chainId].config.blockExplorerUrls[0];

export {
	initialContractsInfos,
	contractsInfos,
	defaultRPC,
	isUsingLocalDevNetwork,
	localRPC,
	blockTime,
	SYNC_DB_NAME,
	syncInfo,
	FUZD_URI,
	blockchainExplorer,
};

console.log(`VERSION: ${version}`);

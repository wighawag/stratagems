import {
	Abi,
	CustomTransport,
	PublicClient,
	WalletClient,
	createPublicClient,
	createWalletClient,
	custom,
	defineChain,
	getContract,
} from 'viem';

import {network} from 'hardhat';
import type {EIP1193ProviderWithoutEvents} from 'eip-1193';
import {Chain} from 'viem';

export type Connection = {
	walletClient: WalletClient<CustomTransport, Chain>;
	publicClient: PublicClient<CustomTransport, Chain>;
	accounts: `0x${string}`[];
	provider: EIP1193ProviderWithoutEvents;
};

/**
 * ONE connection to the network hardhat runs this process against (Hardhat 3:
 * `network.connect()`), shared by everything in the process: the deploys, the
 * fixtures (`loadFixture` snapshots THIS connection's chain) and the viem clients.
 */
const hardhatConnection = await network.connect();
export const networkName = hardhatConnection.networkName;
export const hardhatProvider = hardhatConnection.provider;
export const loadFixture = hardhatConnection.networkHelpers.loadFixture;
export const networkHelpers = hardhatConnection.networkHelpers;

const cache: {connection?: Connection} = {};
export async function getConnection(): Promise<Connection> {
	if (cache.connection) {
		return cache.connection;
	}
	const provider = hardhatProvider as unknown as EIP1193ProviderWithoutEvents;

	const chainIdAsHex = await provider.request({method: 'eth_chainId'});
	const chainIdAsNumber = Number(chainIdAsHex);
	const chain = defineChain({
		id: chainIdAsNumber,
		name: networkName,
		network: networkName,
		nativeCurrency: {
			decimals: 18,
			name: 'Ether',
			symbol: 'ETH',
		},
		rpcUrls: {
			default: {http: []},
			public: {http: []},
		},
	} as const);

	const walletClient = createWalletClient({
		chain,
		transport: custom(provider),
	});
	const publicClient = createPublicClient({
		chain,
		transport: custom(provider),
	});
	return (cache.connection = {
		walletClient,
		publicClient,
		accounts: await walletClient.getAddresses(),
		provider,
	});
}

export async function fetchContract<TAbi extends Abi>(contractInfo: {address: `0x${string}`; abi: TAbi}) {
	const {walletClient, publicClient} = await getConnection();
	return getContract({
		...contractInfo,
		client: {wallet: walletClient, public: publicClient},
	});
}

export type ContractWithViemClient<TAbi extends Abi> = Awaited<ReturnType<typeof fetchContract<TAbi>>>;

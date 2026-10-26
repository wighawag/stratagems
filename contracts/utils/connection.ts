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
	type GetContractReturnType,
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

/**
 * A contract bound to both clients. Named rather than inferred: since `tsc` emits
 * declarations (the package's `dist`, for the web's offline world), an inferred
 * viem contract type is too long to serialise (TS7056).
 */
export type ContractWithViemClient<TAbi extends Abi> = GetContractReturnType<
	TAbi,
	{public: Connection['publicClient']; wallet: Connection['walletClient']}
>;

export async function fetchContract<TAbi extends Abi>(contractInfo: {
	address: `0x${string}`;
	abi: TAbi;
}): Promise<ContractWithViemClient<TAbi>> {
	const {walletClient, publicClient} = await getConnection();
	return getContract({
		...contractInfo,
		client: {wallet: walletClient, public: publicClient},
	});
}

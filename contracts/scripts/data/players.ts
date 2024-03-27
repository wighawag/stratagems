import {createIndexerState} from 'ethereum-indexer-browser';
import {keepStateOnFile, keepStreamOnFile} from 'ethereum-indexer-fs';
import contractsInfo from './contracts';
import hre from 'hardhat';

import type {MergedAbis, JSProcessor} from 'ethereum-indexer-js-processor';
import {fromJSProcessor} from 'ethereum-indexer-js-processor';
import {zeroAddress} from 'viem';

const testTokenAddress = contractsInfo.contracts['TestTokens'].address.toLowerCase();
const stratagemsAddress = contractsInfo.contracts['Stratagems'].address.toLowerCase();

export type Data = {
	players: {
		[address: `0x${string}`]: {balance: bigint};
	};
};

type ContractsABI = MergedAbis<typeof contractsInfo.contracts>;

const ignoreAddresses = [
	`0x91fdbbc7dce85ae3ffdbd53f9655000e5993d1ea`, // claim key claimed
	'0x7913e00e37b9d756caf3fda78640458c6bc135d3', // claim key claimed
	`0x9b94e2b46b53efa924937c17ca7ea1d899ad7f08`, // claim key claimed
	// '0xf1933fd6fb08f34769af5d4350303fa93bc5e0b0', // claim key claimed
	`0x784bd82da3ef62c48b85749efd49a79d191b5111`, // was used to setup black factions
	'0xb4a8cf4a978e2940ee8c01583ffa6016fcd053a2', // test account
	'0x7625ee9d5b346f1d18411e1bee5458b7831d62ea', // test account
	stratagemsAddress,
];

const StratagemsIndexerProcessor: JSProcessor<ContractsABI, Data> = {
	version: '4',
	construct(): Data {
		return {
			players: {},
		};
	},
	onTransfer(state, event) {
		const contractAddress = event.address.toLowerCase();
		const from = event.args.from.toLowerCase();
		const to = event.args.to.toLowerCase();
		const amount = event.args.value;
		if (contractAddress === testTokenAddress) {
			if (state.players[from]) {
				const playerFROM = state.players[from];
				playerFROM.balance -= amount;
			}
			if (
				!ignoreAddresses.includes(to) &&
				((to != zeroAddress && state.players[to]) ||
					(event.args.value >= 20000000000000000000n && event.args.value < 21000000000000000000n))
			) {
				const playerTO = (state.players[to] = state.players[to] || {balance: 0n});
				playerTO.balance += amount;
			}
		}
	},
};

const createProcessor = fromJSProcessor(() => StratagemsIndexerProcessor);

export const processor = createProcessor();
export const {state, init, indexToLatest} = createIndexerState(processor, {
	keepState: keepStateOnFile('.data', 'stratagems') as any, // TODO types
	keepStream: keepStreamOnFile('.data', 'stratagems'),
});

export async function indexPlayersGiven20Tokens() {
	await init({
		provider: hre.network.provider as any, // TOD type
		source: {
			chainId: contractsInfo.chainId,
			contracts: Object.keys(contractsInfo.contracts).map((name) => (contractsInfo as any).contracts[name]),
			genesisHash: contractsInfo.genesisHash,
		},
	});
	await indexToLatest();
	return state.$state;
}

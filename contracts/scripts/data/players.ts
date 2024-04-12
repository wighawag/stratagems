import {createIndexerState} from 'ethereum-indexer-browser';
import {keepStateOnFile, keepStreamOnFile} from 'ethereum-indexer-fs';
import contractsInfo from './contracts';
import hre from 'hardhat';

import type {MergedAbis, JSProcessor} from 'ethereum-indexer-js-processor';
import {fromJSProcessor} from 'ethereum-indexer-js-processor';
import {formatEther, zeroAddress} from 'viem';

const testTokenAddress = contractsInfo.contracts['TestTokens'].address.toLowerCase();
const stratagemsAddress = contractsInfo.contracts['Stratagems'].address.toLowerCase();

export type Data = {
	players: {
		[address: `0x${string}`]: {balance: bigint; tokenGiven: bigint};
	};
};

type ContractsABI = MergedAbis<typeof contractsInfo.contracts>;

const tokenGiver = `0xab1346cf31b343ddfbe03effee19bab88c410514`;

const playerWhoReceivedByClaimLinks: {address: `0x${string}`; claim: `0x${string}`}[] = [
	{address: `0x784bd82DA3eF62c48b85749efD49a79D191b5111`, claim: `0x91fdbbc7dce85ae3ffdbd53f9655000e5993d1ea`},
	{address: `0x2981000A489dD625479Bf612A29910F7De8556B4`, claim: `0x7913e00e37b9d756caf3fda78640458c6bc135d3`},
	{address: `0x20ab318e3391233bdbf41d4548103261df1b2bed`, claim: `0x9b94e2b46b53efa924937c17ca7ea1d899ad7f08`},
	{address: `0xfe3865dD730EAbfe973B2D9035c4eefED3076a36`, claim: `0xf1933fd6fb08f34769af5d4350303fa93bc5e0b0`},
];

const ignoreAddresses = [
	`0xffffffffffffffffffffffffffffffffffffffff`, //black
	`0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead`,
	`0xbE19B59E8C588d68f475A407C7BA5fE813AEb792`.toLowerCase(), // admin
	tokenGiver.toLowerCase(),
	`0x283aFaad5c345680144f20F3910EA95e5F0bA932`.toLowerCase(), // account 3
	`0x784bd82da3ef62c48b85749efd49a79d191b5111`, // was used to setup black factions
	'0xb4a8cf4a978e2940ee8c01583ffa6016fcd053a2', // test account
	'0x7625ee9d5b346f1d18411e1bee5458b7831d62ea', // test account
	stratagemsAddress,
];

const claimKeys: {[key: string]: `0x${string}`} = {};
for (const player of playerWhoReceivedByClaimLinks) {
	claimKeys[player.claim.toLowerCase()] = player.address;
	ignoreAddresses.push(player.claim.toLowerCase());
}

const StratagemsIndexerProcessor: JSProcessor<ContractsABI, Data> = {
	version: `` + Math.random(),
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
			if (
				!ignoreAddresses.includes(to) &&
				(from.toLowerCase() === tokenGiver.toLowerCase() || claimKeys[from.toLowerCase()])
			) {
				const playerGiven = (state.players[to] = state.players[to] || {balance: 0n, tokenGiven: 0n});
				playerGiven.tokenGiven += amount;
			}

			if (!ignoreAddresses.includes(from) && to.toLowerCase() === tokenGiver.toLowerCase()) {
				const playerGiven = (state.players[from] = state.players[from] || {balance: 0n, tokenGiven: 0n});
				playerGiven.tokenGiven -= amount;
			}

			if (state.players[from]) {
				const playerFROM = state.players[from];
				playerFROM.balance -= amount;
			}
			if (!ignoreAddresses.includes(to) && to != zeroAddress) {
				const playerTO = (state.players[to] = state.players[to] || {balance: 0n, tokenGiven: 0n});
				playerTO.balance += amount;
			}
		}
	},
};

const createProcessor = fromJSProcessor(() => StratagemsIndexerProcessor);

export const processor = createProcessor();
export const {state, init, indexToLatest} = createIndexerState(processor, {
	keepState: keepStateOnFile('.data', 'players') as any, // TODO types
	keepStream: keepStreamOnFile('.data', 'stratagems'),
});

export async function indexPlayers() {
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

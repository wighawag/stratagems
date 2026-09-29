import contractsInfo from './contracts';
import hre from 'hardhat';

import type {EntityProcessor} from '@etherfold/processor-entities';
import {zeroAddress} from 'viem';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';
import {indexInProcess} from '../../utils/indexer';

const testTokenAddress = contractsInfo.contracts['TestTokens'].address.toLowerCase();
const stratagemsAddress = contractsInfo.contracts['Stratagems'].address.toLowerCase();

export type Data = {
	players: {
		[address: `0x${string}`]: {balance: bigint; tokenGiven: bigint};
	};
};

type TestTokensABI = (typeof contractsInfo.contracts)['TestTokens']['abi'];

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

/**
 * Per player, the test tokens they hold and were given. A balance can go negative
 * here (a player's transfers are counted from the first gift on), so the two
 * amounts are decimal TEXT rather than `u256`, which refuses a negative value.
 */
const PlayersProcessor: EntityProcessor<TestTokensABI> = {
	entities: [{name: 'player', id: 'address', fields: {balance: 'text', tokenGiven: 'text'}}],
	async onTransfer(state, event) {
		const contractAddress = event.address.toLowerCase();
		const from = event.args.from.toLowerCase();
		const to = event.args.to.toLowerCase();
		const amount = event.args.value;
		if (contractAddress !== testTokenAddress) return;

		const read = async (address: string) => {
			const row = await state.get<{balance: string; tokenGiven: string}>('player', {address});
			return row ? {balance: BigInt(row.balance), tokenGiven: BigInt(row.tokenGiven)} : undefined;
		};
		const write = (address: string, player: {balance: bigint; tokenGiven: bigint}) =>
			state.set('player', {address}, {balance: player.balance.toString(), tokenGiven: player.tokenGiven.toString()});

		if (
			!ignoreAddresses.includes(to) &&
			(from.toLowerCase() === tokenGiver.toLowerCase() || claimKeys[from.toLowerCase()])
		) {
			const playerGiven = (await read(to)) ?? {balance: 0n, tokenGiven: 0n};
			playerGiven.tokenGiven += amount;
			write(to, playerGiven);
		}

		if (!ignoreAddresses.includes(from) && to.toLowerCase() === tokenGiver.toLowerCase()) {
			const playerGiven = (await read(from)) ?? {balance: 0n, tokenGiven: 0n};
			playerGiven.tokenGiven -= amount;
			write(from, playerGiven);
		}

		const playerFROM = await read(from);
		if (playerFROM) {
			playerFROM.balance -= amount;
			write(from, playerFROM);
		}
		if (!ignoreAddresses.includes(to) && to != zeroAddress) {
			const playerTO = (await read(to)) ?? {balance: 0n, tokenGiven: 0n};
			playerTO.balance += amount;
			write(to, playerTO);
		}
	},
};

export async function indexPlayers(): Promise<Data> {
	const env = await loadEnvironmentFromHardhat({hre}, {useChainIdOfForkedNetwork: true});
	const TestTokens = contractsInfo.contracts['TestTokens'];
	const indexed = await indexInProcess({
		processor: PlayersProcessor,
		provider: env.network.provider,
		source: {
			chainId: contractsInfo.chainId,
			genesisHash: contractsInfo.genesisHash as `0x${string}`,
			contracts: [{abi: TestTokens.abi, address: TestTokens.address, startBlock: TestTokens.startBlock}],
		},
		db: `file:.data/players-${contractsInfo.name}.db`,
	});
	try {
		const {data, errors} = await indexed.execute({
			query: `{ player(first: 100000) { address balance tokenGiven } }`,
		});
		if (errors) throw new Error(errors[0].message);
		const players: Data['players'] = {};
		for (const row of (data as {player: {address: `0x${string}`; balance: string; tokenGiven: string}[]}).player) {
			players[row.address] = {balance: BigInt(row.balance), tokenGiven: BigInt(row.tokenGiven)};
		}
		return {players};
	} finally {
		indexed.close();
	}
}

import {describe, it, expect} from 'vitest';
import {decodeFunctionData, getAddress} from 'viem';
import {
	offlineSeatLabels,
	offlineTableCreator,
	seatTheOfflineTable,
} from '$lib/game/lobby/offline-table';
import {FACTORY_ABI} from '$lib/game/lobby/table';
import {seatsPlayedByTheWorld, tableOf} from '$lib/game/lobby/seats';
import {TABLE_SEATS} from '$lib/game/lobby/lobby';

/**
 * THE OFFLINE TABLE'S GAME-AGNOSTIC HALF (stratagems' plan, step OT3, OT3-2):
 * who creates the table, the boot's steps around the game's stake, and the
 * panel's names for the seats. The steps against a real world (a chain, the
 * game's deploy, its factory) are `test/lib/embedded/world.test.ts`'s.
 */

const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
// not one of the world's seats' keys (hardhat's third account is one)
const BOB = '0x0000000000000000000000000000000000000B0B' as const;
const CHAIN = {
	id: 31337,
	name: 'Offline',
	nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
	rpcUrls: {default: {http: [] as string[]}},
};

describe('offlineTableCreator', () => {
	it("sends as the wallet's first account, through the wallet's own provider", async () => {
		const sent: {method: string; params?: unknown}[] = [];
		const underlyingProvider = {
			request: async ({method, params}: {method: string; params?: unknown}) => {
				sent.push({method, params});
				if (method === 'eth_chainId') return '0x7a69';
				if (method === 'eth_sendTransaction') return `0x${'11'.repeat(32)}`;
				throw new Error(`unexpected ${method}`);
			},
		};
		const creator = offlineTableCreator(
			{
				accounts: [ALICE, BOB],
				handle: {walletProvider: {underlyingProvider}} as never,
			},
			CHAIN,
		);
		expect(creator.address).toBe(ALICE);
		const factory = '0x00000000000000000000000000000000000000fa' as const;
		const hash = await creator.writeContract({
			address: factory,
			abi: FACTORY_ABI,
			functionName: 'createGame',
			args: [3, 2, `0x${'00'.repeat(32)}`],
		});
		expect(hash).toBe(`0x${'11'.repeat(32)}`);
		const transaction = sent.find(
			(request) => request.method === 'eth_sendTransaction',
		)!;
		const [tx] = transaction.params as [
			{from: `0x${string}`; to: `0x${string}`; data: `0x${string}`},
		];
		expect(getAddress(tx.from)).toBe(ALICE);
		expect(getAddress(tx.to)).toBe(getAddress(factory));
		expect(
			decodeFunctionData({abi: FACTORY_ABI, data: tx.data}).functionName,
		).toBe('createGame');
	});
});

describe('seatTheOfflineTable', () => {
	it('refuses a stored record the chain does not hold, with nothing staked or started', async () => {
		const steps: string[] = [];
		let staked = 0;
		const reader = {
			readContract: async ({functionName}: {functionName: string}) => {
				if (functionName === 'numGames') return 0n;
				throw new Error(`unexpected ${functionName}`);
			},
		};
		const opened = await seatTheOfflineTable({
			reader: reader as never,
			creator: {
				address: ALICE,
				writeContract: async () => {
					throw new Error('nothing is sent');
				},
			},
			factory: '0x00000000000000000000000000000000000000fa',
			implementation: '0x00000000000000000000000000000000000000fb',
			storage: {
				getItem: () => '0x00000000000000000000000000000000000000aa',
				setItem: () => {},
			},
			storageKey: 'offline-world:table',
			seats: 2,
			cycles: 2,
			gameOptions: `0x${'00'.repeat(32)}`,
			stake: async () => {
				staked++;
			},
			onStep: (what) => steps.push(what),
		});
		expect(opened.kind).toBe('incoherent');
		expect(staked).toBe(0);
		expect(steps).toEqual(['setting the table']);
	});
});

describe('offlineSeatLabels', () => {
	it('names the other people here by their number and the world by its level', async () => {
		const table = tableOf(4, 2, ['greedy', 'random'], TABLE_SEATS);
		const world = seatsPlayedByTheWorld(table);
		// an identity the chain has to be asked for, as an avatar game's is
		const identityOf = async (address: `0x${string}`) => BigInt(address) + 1n;
		const label = await offlineSeatLabels({
			table,
			accounts: [ALICE, BOB],
			identityOf,
			levels: [
				{id: 'random', label: 'Random'},
				{id: 'greedy', label: 'Greedy'},
			],
		});
		expect(label(BigInt(ALICE) + 1n)).toBe('Player 1');
		expect(label(BigInt(BOB) + 1n)).toBe('Player 2');
		expect(label(BigInt(world[0].address) + 1n)).toBe('The world (Greedy)');
		// a random seat carries no level, and the lobby names it "The world"
		expect(label(BigInt(world[1].address) + 1n)).toBe('The world');
		expect(label(1n)).toBeUndefined();
	});

	it('names every world seat "The world" where the game offers no levels, with a synchronous identity', async () => {
		const table = tableOf(3, 1, [], TABLE_SEATS);
		const label = await offlineSeatLabels({
			table,
			accounts: undefined,
			identityOf: (address) => BigInt(address),
		});
		for (const seat of seatsPlayedByTheWorld(table)) {
			expect(label(BigInt(seat.address))).toBe('The world');
		}
		// no wallet yet: nobody here is named
		expect(label(BigInt(ALICE))).toBeUndefined();
	});
});

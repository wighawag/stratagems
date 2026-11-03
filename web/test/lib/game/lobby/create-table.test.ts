import {describe, expect, it, vi} from 'vitest';
import {get, readable} from 'svelte/store';
import {encodeAbiParameters, encodeEventTopics, parseAbi} from 'viem';
import {
	createTablesLobby,
	DEFAULT_TABLE_CYCLES,
	FACTORY_ABI,
	NO_GAME_OPTIONS,
} from '$lib/game/lobby/table';
import {InsufficientFundsError} from '$lib/core/transaction';

/**
 * CREATING A TABLE IS PAID BY THE ACCOUNT, so it goes through the balance
 * check like every other transaction the account pays for: a creator with no
 * ether meets the insufficient-funds modal and its faucet rather than the
 * node's raw error (found by stratagems' LAN rehearsal, where every newcomer
 * starts with nothing).
 */
const FACTORY = '0x00000000000000000000000000000000000fac70' as const;
const TABLE = '0x00000000000000000000000000000000000ab1e5' as const;
const CREATOR = '0x000000000000000000000000000000000000c0de' as const;

function gameCreatedLog() {
	const topics = encodeEventTopics({
		abi: parseAbi([
			'event GameCreated(address indexed game, address indexed creator, uint8 seats, uint16 cycles, bytes32 gameOptions)',
		]),
		eventName: 'GameCreated',
		args: {game: TABLE, creator: CREATOR},
	});
	return {
		address: FACTORY,
		topics,
		data: encodeAbiParameters(
			[{type: 'uint8'}, {type: 'uint16'}, {type: 'bytes32'}],
			[2, DEFAULT_TABLE_CYCLES, NO_GAME_OPTIONS],
		),
		blockNumber: 1n,
		transactionHash: `0x${'11'.repeat(32)}`,
		logIndex: 0,
		blockHash: `0x${'22'.repeat(32)}`,
		transactionIndex: 0,
		removed: false,
	};
}

function setup(
	ensureCanAfford: (request: any, config: any) => Promise<unknown>,
) {
	const writeContract = vi.fn(async () => `0x${'33'.repeat(32)}` as const);
	const deps = {
		publicClient: {
			waitForTransactionReceipt: vi.fn(async () => ({
				logs: [gameCreatedLog()],
			})),
			readContract: vi.fn(async () => 0n),
		},
		accountExecutor: readable({
			status: 'ready',
			client: {writeContract},
			account: CREATOR,
			address: CREATOR,
		}),
		connection: {ensureConnected: vi.fn(async () => undefined)},
		deployments: {get: () => ({})},
		balanceCheck: {ensureCanAfford: vi.fn(ensureCanAfford)},
		accountBalance: readable({step: 'Loaded', value: 0n}),
	};
	const lobby = {
		factory: () => ({address: FACTORY}),
		deploymentsAt: (d: unknown) => d,
	};
	const store = createTablesLobby({deps: deps as never, lobby: lobby as never});
	return {store, deps, writeContract};
}

describe('creating a table', () => {
	it('asks the balance check first, with the account paying, then sends what it returns', async () => {
		const {store, deps, writeContract} = setup(async (request) => ({
			...request.contract,
			gas: 123n,
		}));
		expect((await store.create(2))?.toLowerCase()).toBe(TABLE);

		const [request, config] = deps.balanceCheck.ensureCanAfford.mock.calls[0];
		expect(request.contract.address).toBe(FACTORY);
		expect(request.contract.abi).toBe(FACTORY_ABI);
		expect(request.contract.functionName).toBe('createGame');
		// No count and no options: the default count, and none.
		expect(request.contract.args).toEqual([
			2,
			DEFAULT_TABLE_CYCLES,
			NO_GAME_OPTIONS,
		]);
		expect(config.sender).toBe(CREATOR);
		expect(config.balance).toBe(deps.accountBalance);
		// what the check returned is what is sent
		expect((writeContract.mock.calls[0] as unknown[])[0]).toMatchObject({
			functionName: 'createGame',
			gas: 123n,
		});
		const created = get(store.creating);
		expect(created.step).toBe('Created');
		expect((created as {table: string}).table.toLowerCase()).toBe(TABLE);
	});

	it('goes back to idle, sending nothing, when the creator stops at the insufficient-funds modal', async () => {
		const {store, writeContract} = setup(async () => {
			throw new InsufficientFundsError(0n, 1n);
		});
		expect(await store.create(2)).toBeUndefined();
		expect(writeContract).not.toHaveBeenCalled();
		expect(get(store.creating)).toEqual({step: 'Idle'});
	});

	it("sends the creator's count of cycles, kept inside the bounds, and the game's options", async () => {
		const {store, deps} = setup(async (request) => request.contract);
		const options = `0x${'00'.repeat(31)}2a` as const;
		await store.create(3, {cycles: 4, gameOptions: options});
		expect(
			deps.balanceCheck.ensureCanAfford.mock.calls[0][0].contract.args,
		).toEqual([3, 4, options]);
		await store.create(3, {cycles: 1000});
		expect(
			deps.balanceCheck.ensureCanAfford.mock.calls[1][0].contract.args,
		).toEqual([3, 100, NO_GAME_OPTIONS]);
	});
});

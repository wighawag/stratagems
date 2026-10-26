import {describe, it, expect, afterEach} from 'vitest';
import {
	createPublicClient,
	createWalletClient,
	custom,
	zeroAddress,
	type Account,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {bigIntIDToXY, xyToBigIntID} from 'stratagems-common';
import {config, extensions} from 'stratagems-contracts/rocketh/config.js';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import {
	OFFLINE_DEPLOYMENT,
	playedByTheWorld,
	stakeForOfflinePlayer,
} from '$lib/offline';
import {createOfflinePlayers, turnFor} from '$lib/offline-players';
import {
	SEATS_BY_DEFAULT,
	seatsPlayedByTheWorld,
	tableOf,
} from '$lib/game/lobby/seats';
import {playedSeatSecret} from '$lib/game/core/secret';
import {buildCommitmentChain} from '$lib/game/core/commit-reveal/chain';
import {bondFor, resolveStratagemsConfig} from '$lib/stratagems/game-config';
import {MOVE_ENCODING, type Move} from '$lib/stratagems/moves';
import {defaultColorOf} from '$lib/stratagems/faction';

// No `.svelte.` infix: the `server` project, node, a whole world in process.
//
// STRATAGEMS' OWN, AT THE TEMPLATE'S PATH (step O, P10, of
// work/plans/join-template-commit-reveal.md). What a played seat must do, on
// stratagems' own contracts: commit and reveal one derived move a cycle with
// nothing in memory, so that a three-member manual cycle turns; rebuild its
// turn after a reload; replace a commitment it could not open while the commit
// phase can still take one; and, stratagems' own case, take test gems and
// restake when its reserve cannot cover its move, rather than freezing the
// board (P5).

const CHAIN_ID = 9007199254740127;
const TABLE = tableOf(SEATS_BY_DEFAULT);
const PLAYED = seatsPlayedByTheWorld(TABLE);
const PLAY_MONEY = 10n ** 24n;

/**
 * The human, in this test: a key of its own (not one of the seats', which are
 * hardhat's development accounts from the third on, nor the payers'), acting
 * independently of the loop under test.
 */
const HUMAN = privateKeyToAccount(
	'0x1111111111111111111111111111111111111111111111111111111111111111',
);
const HUMAN_SECRET =
	'0x2222222222222222222222222222222222222222222222222222222222222222' as const;
/** Outside the 13 by 13 block the seats play in, so nobody contests it. */
const HUMAN_MOVE: Move = {position: xyToBigIntID(10, 10), color: 1};

let world: EmbeddedWorld | undefined;
afterEach(async () => {
	await world?.dispose();
	world = undefined;
});

type Cycle = {cycleNumber: bigint; commiting: boolean};
type Attendance = {waitedFor: bigint; committed: bigint; revealed: bigint};
type Commitment = {hash: `0x${string}`; cycleNumber: bigint; bond: bigint};
type FullCell = {owner: `0x${string}`; color: number; life: number};

/** A world with the human and the seats at the table, all of them staked unless told otherwise. */
async function buildWorld(options: {stakeSeats: boolean} = {stakeSeats: true}) {
	return createEmbeddedWorld({
		chainId: CHAIN_ID,
		chain: {
			name: 'Offline',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			properties: {...config.chains[31337].properties},
		},
		rocketh: {config: config as never, extensions},
		environment: OFFLINE_DEPLOYMENT.environment,
		scripts: [...OFFLINE_DEPLOYMENT.scripts],
		accounts: {...OFFLINE_DEPLOYMENT.accounts},
		initialBalances: {...OFFLINE_DEPLOYMENT.initialBalances},
		provision: async ({env, node}) => {
			for (const address of [HUMAN.address, ...PLAYED.map((p) => p.address)]) {
				await node.provider.request({
					method: 'evm_setBalance',
					params: [address, `0x${PLAY_MONEY.toString(16)}`],
				} as never);
			}
			await stakeForOfflinePlayer({env, player: HUMAN.address});
			if (options.stakeSeats) {
				for (const played of PLAYED) {
					await stakeForOfflinePlayer({env, player: played.address});
				}
			}
		},
	});
}

function playersOf(built: EmbeddedWorld) {
	return createOfflinePlayers({
		provider: built.provider,
		deployments: built.deployments,
		config: resolveStratagemsConfig(built.deployments.get() as never),
		players: playedByTheWorld(TABLE),
	});
}

function clientsOf(built: EmbeddedWorld) {
	const records = built.deployments.get();
	const chain = {
		id: records.chain.id,
		name: records.chain.name,
		nativeCurrency: records.chain.nativeCurrency,
		rpcUrls: {default: {http: [] as string[]}},
	};
	const game = {
		address: records.contracts.Stratagems.address,
		abi: records.contracts.Stratagems.abi,
	};
	const tokens = {
		address: records.contracts.TestTokens.address,
		abi: records.contracts.TestTokens.abi,
	};
	const publicClient = createPublicClient({
		chain,
		transport: custom(built.provider as never),
	});

	async function send(
		account: Account,
		request: Record<string, unknown>,
	): Promise<void> {
		const client = createWalletClient({
			account,
			chain,
			transport: custom(built.provider as never),
		});
		const hash = await client.writeContract({
			...game,
			chain: null,
			account,
			...request,
		} as never);
		const receipt = await publicClient.waitForTransactionReceipt({hash});
		expect(receipt.status, String(request.functionName)).toBe('success');
	}

	async function read<T>(functionName: string, args: unknown[] = []) {
		return (await publicClient.readContract({
			...game,
			functionName,
			args,
		} as never)) as T;
	}

	async function gemsOf(address: `0x${string}`) {
		return (await publicClient.readContract({
			...tokens,
			functionName: 'balanceOf',
			args: [address],
		} as never)) as bigint;
	}

	return {game, send, read, gemsOf};
}

function chainOf(actions: readonly Move[], secret: `0x${string}`) {
	return buildCommitmentChain<Move>({
		actions,
		secret,
		actionsPerReveal: 32,
		encoding: MOVE_ENCODING,
	});
}

describe('a played seat\u2019s turn', () => {
	it('is one move in the 13 by 13 block around the origin, in the seat\u2019s default colour, the same every time', () => {
		const game = '0x00000000000000000000000000000000000000aa' as const;
		for (const played of PLAYED) {
			const identity = BigInt(played.address);
			for (let cycleNumber = 2; cycleNumber < 40; cycleNumber++) {
				const turn = turnFor({game, identity, cycleNumber});
				expect(turn).toHaveLength(1);
				expect(turn).toEqual(turnFor({game, identity, cycleNumber}));
				const {x, y} = bigIntIDToXY(turn[0].position);
				expect(Math.abs(x)).toBeLessThanOrEqual(6);
				expect(Math.abs(y)).toBeLessThanOrEqual(6);
				expect(turn[0].color).toBe(defaultColorOf(played.address));
			}
		}
	});
});

describe('the other players in stratagems\u2019 offline world', () => {
	it('enrols THREE waited-for members', async () => {
		world = await buildWorld();
		const attendance = await clientsOf(world).read<Attendance>('getAttendance');
		expect(attendance.waitedFor).toBe(3n);
		expect(attendance.committed).toBe(0n);
	});

	it('plays a whole cycle: three commits, an advance, three reveals, an advance, their cells on the board', async () => {
		world = await buildWorld();
		const {send, read, game} = clientsOf(world);
		const stratagems = resolveStratagemsConfig(
			world.deployments.get() as never,
		);
		const players = playersOf(world);
		const humanIdentity = BigInt(HUMAN.address);

		const opening = await read<Cycle>('getCycle');
		expect(opening.cycleNumber).toBe(2n);
		expect(opening.commiting).toBe(true);

		// the seats commit on a pass of their own, holding nothing in memory
		await players.tick();
		expect((await read<Attendance>('getAttendance')).committed).toBe(2n);
		// and the cycle cannot move without the human
		await expect(
			send(HUMAN, {functionName: 'advanceCycle', args: []}),
		).rejects.toThrow();

		const humanChain = chainOf([HUMAN_MOVE], HUMAN_SECRET);
		await send(HUMAN, {
			functionName: 'makeCommitment',
			args: [
				humanIdentity,
				humanChain[0].hash,
				bondFor(stratagems, 1),
				zeroAddress,
			],
		});
		await send(HUMAN, {functionName: 'advanceCycle', args: []});
		expect((await read<Cycle>('getCycle')).commiting).toBe(false);
		// nor close while the seats owe a reveal
		await expect(
			send(HUMAN, {functionName: 'advanceCycle', args: []}),
		).rejects.toThrow();

		await players.tick();
		expect((await read<Attendance>('getAttendance')).revealed).toBe(2n);

		await send(HUMAN, {
			functionName: 'reveal',
			args: [
				humanIdentity,
				[HUMAN_MOVE],
				HUMAN_SECRET,
				humanChain[0].furtherActions,
				zeroAddress,
			],
		});
		await send(HUMAN, {functionName: 'advanceCycle', args: []});
		const next = await read<Cycle>('getCycle');
		expect(next.cycleNumber).toBe(3n);
		expect(next.commiting).toBe(true);

		// WHAT THE PLAYED TURNS DID, read off the board
		for (const played of playedByTheWorld(TABLE)) {
			const [move] = turnFor({
				game: game.address,
				identity: played.identity,
				cycleNumber: 2,
			});
			const [cell] = await read<FullCell[]>('getCells', [[move.position]]);
			expect(
				cell.owner.toLowerCase(),
				JSON.stringify(bigIntIDToXY(move.position)),
			).toBe(played.address.toLowerCase());
			expect(cell.color).toBe(move.color);
		}
		const [humanCell] = await read<FullCell[]>('getCells', [
			[HUMAN_MOVE.position],
		]);
		expect(humanCell.owner.toLowerCase()).toBe(HUMAN.address.toLowerCase());
	});

	it('reconstructs the same turn and the same secret after a reload', async () => {
		world = await buildWorld();
		const {read, game} = clientsOf(world);
		const records = world.deployments.get();
		const [first] = playedByTheWorld(TABLE);

		await playersOf(world).tick();
		const before = await read<Commitment>('getCommitment', [first.identity]);
		expect(before.cycleNumber).toBe(2n);

		// rebuilt from the public inputs alone, which is what a reload has
		const rebuilt = chainOf(
			turnFor({game: game.address, identity: first.identity, cycleNumber: 2}),
			playedSeatSecret({
				chainId: records.chain.id,
				contract: game.address,
				identity: first.identity,
				cycleNumber: 2,
			}),
		);
		expect(rebuilt[0].hash.toLowerCase()).toBe(before.hash.toLowerCase());
	});

	it('replaces a commitment it could not open, while the commit phase can still take one', async () => {
		world = await buildWorld();
		const {send, read} = clientsOf(world);
		const [first] = playedByTheWorld(TABLE);
		const notOurs =
			'0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as const;
		await send(privateKeyToAccount(first.privateKey), {
			functionName: 'makeCommitment',
			args: [first.identity, notOurs, 0n, zeroAddress],
		});

		await playersOf(world).tick();

		const after = await read<Commitment>('getCommitment', [first.identity]);
		expect(after.hash).not.toBe(notOurs);
		expect(after.cycleNumber).toBe(2n);
		// the replacement is counted once
		expect((await read<Attendance>('getAttendance')).committed).toBe(2n);
	});

	it('takes test gems and restakes when its reserve cannot cover its move, rather than an empty turn', async () => {
		// THE SEATS START WITH NOTHING: no reserve, no gems in the wallet. A
		// stratagems seat's gems only leave the reserve (a placement puts one on
		// its cell, and what a dead cell pays goes to wallets), so this is where
		// every seat ends up; an empty turn for ever would leave the board still.
		world = await buildWorld({stakeSeats: false});
		const {read, game, gemsOf} = clientsOf(world);
		const records = world.deployments.get();
		for (const played of PLAYED) {
			expect(await read<bigint>('getReserve', [BigInt(played.address)])).toBe(
				0n,
			);
			expect(await gemsOf(played.address)).toBe(0n);
		}

		await playersOf(world).tick();

		for (const played of playedByTheWorld(TABLE)) {
			const onChain = await read<Commitment>('getCommitment', [
				played.identity,
			]);
			const move = turnFor({
				game: game.address,
				identity: played.identity,
				cycleNumber: 2,
			});
			const head = chainOf(
				move,
				playedSeatSecret({
					chainId: records.chain.id,
					contract: game.address,
					identity: played.identity,
					cycleNumber: 2,
				}),
			)[0].hash;
			// its MOVE, bonded, not the empty turn
			expect(onChain.hash.toLowerCase(), played.address).toBe(
				head.toLowerCase(),
			);
			expect(onChain.bond).toBeGreaterThan(0n);
			// every gem the distributor gave went into the reserve, and the
			// restake made it a member the cycle waits for
			expect(await gemsOf(played.address)).toBe(0n);
		}
		expect((await read<Attendance>('getAttendance')).waitedFor).toBe(3n);
	});
});

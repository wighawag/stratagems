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
	TABLE_STORAGE_KEY,
	playedByTheWorld,
	playedSeatDecider,
	stakeForEveryoneAtTheTable,
	stakeForOfflinePlayer,
	tableBoardAt,
} from '$lib/offline';
import {readable} from 'svelte/store';
import type {DeploymentsStore} from '$lib/deployments-store';
import {lobby as gameLobby} from '$lib/context/index';
import {TABLE_SEATS} from '$lib/game/lobby/lobby';
import {openOfflineTable} from '$lib/game/lobby/offline-table';
import {encodeStratagemsOptions} from '$lib/stratagems/table';
import {createBytecodeSandbox} from '$lib/game/simulation';
import type {BoardState} from '$lib/stratagems/board/indexed-board';
import type {StoredCell} from '$lib/stratagems/preview';
import {valueAtEnd} from '$lib/stratagems/score';
import {positionsToRead, type DecisionMeasure} from '$lib/stratagems/strategy';
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
async function buildWorld(
	options: {stakeSeats: boolean; table?: typeof TABLE} = {stakeSeats: true},
) {
	const played = seatsPlayedByTheWorld(options.table ?? TABLE);
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
		expectedContracts: [...OFFLINE_DEPLOYMENT.expectedContracts],
		provision: async ({env, node}) => {
			for (const address of [HUMAN.address, ...played.map((p) => p.address)]) {
				await node.provider.request({
					method: 'evm_setBalance',
					params: [address, `0x${PLAY_MONEY.toString(16)}`],
				} as never);
			}
			await stakeForOfflinePlayer({env, player: HUMAN.address});
			if (options.stakeSeats) {
				for (const seat of played) {
					await stakeForOfflinePlayer({env, player: seat.address});
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

	/**
	 * THE WORLD'S DERIVATION IS A WIRE: a world's played seat must open, after
	 * an upgrade, the commitment an earlier build made. Pinned to what the build
	 * before step OT2 derived (measured on it), so a change to `turnFor` for
	 * tables that moves a world's move fails here.
	 */
	it('is, in a world, exactly the move the builds before tables derived', () => {
		const game = '0x00000000000000000000000000000000000000aa' as const;
		const pinned: [bigint, number, number, number, number][] = [
			[0x3c44cdddb6a900fa2b585dd299e03d12fa4293bcn, 2, 2, 4, 2],
			[0x3c44cdddb6a900fa2b585dd299e03d12fa4293bcn, 3, 1, 3, 2],
			[0x3c44cdddb6a900fa2b585dd299e03d12fa4293bcn, 17, 0, -5, 2],
			[0x90f79bf6eb2c4f870365e785982e1f101e93b906n, 2, -4, -3, 2],
			[0x90f79bf6eb2c4f870365e785982e1f101e93b906n, 3, 4, 4, 2],
			[0x90f79bf6eb2c4f870365e785982e1f101e93b906n, 17, 6, -6, 2],
		];
		for (const [identity, cycleNumber, x, y, color] of pinned) {
			const [move] = turnFor({game, identity, cycleNumber});
			expect(bigIntIDToXY(move.position)).toEqual({x, y});
			expect(move.color).toBe(color);
		}
	});

	it('lands on a table’s board when it is given one, every cell of it reachable', () => {
		const game = '0x00000000000000000000000000000000000000bb' as const;
		// a table of two at the defaults: a side of 6, x and y in -3..2
		const board = {min: -3, max: 2};
		const seen = new Set<string>();
		for (const played of PLAYED) {
			const identity = BigInt(played.address);
			for (let cycleNumber = 1; cycleNumber < 400; cycleNumber++) {
				const turn = turnFor({game, identity, cycleNumber, board});
				expect(turn).toEqual(turnFor({game, identity, cycleNumber, board}));
				const {x, y} = bigIntIDToXY(turn[0].position);
				expect(x).toBeGreaterThanOrEqual(board.min);
				expect(x).toBeLessThanOrEqual(board.max);
				expect(y).toBeGreaterThanOrEqual(board.min);
				expect(y).toBeLessThanOrEqual(board.max);
				seen.add(`${x},${y}`);
			}
		}
		expect(seen.size).toBe(36);
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

/** A storage in memory, as `localStorage` is to the store. */
function memoryStorage() {
	const items = new Map<string, string>();
	return {
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
	};
}

/**
 * One manual cycle with the human at the table committing and revealing an
 * empty turn: the seats commit on a pass, the human commits, the commit phase
 * closes, the seats reveal on a pass, the human reveals, the cycle closes.
 */
async function playEmptyHumanCycle(
	built: EmbeddedWorld,
	players: ReturnType<typeof createOfflinePlayers>,
) {
	const {send, read} = clientsOf(built);
	const {cycleNumber} = await read<Cycle>('getCycle');
	const secret = `0x${cycleNumber.toString(16).padStart(64, '3')}` as const;
	const human = chainOf([], secret);
	await players.tick();
	await send(HUMAN, {
		functionName: 'makeCommitment',
		args: [BigInt(HUMAN.address), human[0].hash, 0n, zeroAddress],
	});
	await send(HUMAN, {functionName: 'advanceCycle', args: []});
	await players.tick();
	await send(HUMAN, {
		functionName: 'reveal',
		args: [
			BigInt(HUMAN.address),
			[],
			secret,
			human[0].furtherActions,
			zeroAddress,
		],
	});
	await send(HUMAN, {functionName: 'advanceCycle', args: []});
}

/**
 * Each seat's NET GEMS (L4-4) after the cycles played: what its wallet and its
 * reserve gained, plus what the board pays it at the end, by the world's own
 * `StratagemsSimulation` (`valueAtEnd`, as a table's score).
 */
async function netGems(
	built: EmbeddedWorld,
	seats: readonly {address: `0x${string}`; identity: bigint}[],
	start: Map<string, bigint>,
) {
	const {read, gemsOf} = clientsOf(built);
	const records = built.deployments.get();
	const simulation = records.contracts.StratagemsSimulation;
	const sandbox = createBytecodeSandbox({
		provider: built.provider as never,
		contracts: {simulation: {address: simulation.address}},
	});
	try {
		const stored = await read<StoredCell[]>('getStoredCells', [
			positionsToRead(),
		]);
		const data = {cells: {}, owners: {}} as unknown as BoardState['data'];
		for (const cell of stored) {
			if (cell.cell.color === 0) continue;
			const key = BigInt(cell.position).toString();
			data.cells[key] = {...cell.cell};
			data.owners[key] = cell.owner.toLowerCase() as `0x${string}`;
		}
		const stratagems = resolveStratagemsConfig(records as never);
		const {cycleNumber} = await read<Cycle>('getCycle');
		const value = await valueAtEnd({
			data,
			cycleNumber: Number(cycleNumber),
			maxLife: stratagems.maxLife,
			numTokensPerGems: stratagems.numTokensPerGems,
			simulate: async (board, cycle, positions) =>
				(await sandbox.call({
					contract: 'simulation',
					abi: simulation.abi,
					functionName: 'poke' as never,
					args: [[...board], cycle, [...positions]] as never,
				})) as never,
		});
		const net = new Map<string, bigint>();
		for (const seat of seats) {
			const held =
				(await gemsOf(seat.address)) +
				(await read<bigint>('getReserve', [seat.identity]));
			net.set(
				seat.address.toLowerCase(),
				held -
					start.get(seat.address.toLowerCase())! +
					(value.get(seat.address.toLowerCase()) ?? 0n),
			);
		}
		return net;
	} finally {
		sandbox.dispose();
	}
}

async function holdings(
	built: EmbeddedWorld,
	seats: readonly {address: `0x${string}`; identity: bigint}[],
) {
	const {read, gemsOf} = clientsOf(built);
	const held = new Map<string, bigint>();
	for (const seat of seats) {
		held.set(
			seat.address.toLowerCase(),
			(await gemsOf(seat.address)) +
				(await read<bigint>('getReserve', [seat.identity])),
		);
	}
	return held;
}

describe('a greedy seat in stratagems\u2019 offline world (step A2)', () => {
	it('commits the turn it decided and stored, reveals it, and a reload in the reveal phase still reveals it', async () => {
		const table = tableOf(3, 1, ['greedy', 'random']);
		world = await buildWorld({stakeSeats: true, table});
		const {send, read} = clientsOf(world);
		const seats = playedByTheWorld(table);
		const [greedy] = seats;
		expect(greedy.level).toBe('greedy');
		const storage = memoryStorage();
		const loop = () => {
			const decider = playedSeatDecider(world!, seats, {storage})!;
			return {
				decider,
				players: createOfflinePlayers({
					provider: world!.provider,
					deployments: world!.deployments,
					config: resolveStratagemsConfig(world!.deployments.get() as never),
					players: seats,
					strategy: decider.strategy,
					turns: decider.turns,
				}),
			};
		};
		const first = loop();
		const records = world.deployments.get();
		const game = records.contracts.Stratagems.address;

		await first.players.tick();
		const stored = first.decider.turns.get(greedy.identity, 2);
		expect(stored).toHaveLength(1);
		const onChain = await read<Commitment>('getCommitment', [greedy.identity]);
		const head = chainOf(
			stored!,
			playedSeatSecret({
				chainId: records.chain.id,
				contract: game,
				identity: greedy.identity,
				cycleNumber: 2,
			}),
		)[0].hash;
		expect(onChain.hash.toLowerCase()).toBe(head.toLowerCase());

		// the human commits and the commit phase closes
		const secret = `0x${'4'.repeat(64)}` as const;
		const human = chainOf([], secret);
		await send(HUMAN, {
			functionName: 'makeCommitment',
			args: [BigInt(HUMAN.address), human[0].hash, 0n, zeroAddress],
		});
		await send(HUMAN, {functionName: 'advanceCycle', args: []});
		first.decider.sandbox.dispose();

		// A RELOAD: a new loop and a new decider over the same storage
		const second = loop();
		await second.players.tick();
		expect((await read<Attendance>('getAttendance')).revealed).toBe(2n);
		const [cell] = await read<FullCell[]>('getCells', [[stored![0].position]]);
		expect(cell.owner.toLowerCase()).toBe(greedy.address.toLowerCase());
		expect(cell.color).toBe(stored![0].color);
		second.decider.sandbox.dispose();
	}, 120_000);

	it('ends twenty cycles with more net gems than each random seat, wherever it sits', async () => {
		// TWENTY, NOT TEN (A2-10 said ten): measured 2026-11-03, after ten cycles
		// one random seat had more (greedy 0.5 gems, a random seat 1, at seat 0),
		// a one-turn greedy against luck over few moves; after twenty, greedy
		// leads every random seat at every position (3, 4.5 and 9 gems against
		// at most 1.5).
		const CYCLES = 20;
		const report: string[] = [];
		for (const at of [0, 1, 2]) {
			const levels = ['random', 'random', 'random'];
			levels[at] = 'greedy';
			const table = tableOf(4, 1, levels);
			world = await buildWorld({stakeSeats: true, table});
			const seats = playedByTheWorld(table);
			const measures: DecisionMeasure[] = [];
			const decider = playedSeatDecider(world, seats, {
				storage: memoryStorage(),
				onDecided: (m) => measures.push(m),
			})!;
			const players = createOfflinePlayers({
				provider: world.provider,
				deployments: world.deployments,
				config: resolveStratagemsConfig(world.deployments.get() as never),
				players: seats,
				strategy: decider.strategy,
				turns: decider.turns,
			});
			const start = await holdings(world, seats);
			for (let c = 0; c < CYCLES; c++)
				await playEmptyHumanCycle(world, players);
			decider.sandbox.dispose();
			const net = await netGems(world, seats, start);
			const greedyNet = net.get(seats[at].address.toLowerCase())!;
			const gem = 10n ** 18n;
			report.push(
				`greedy at ${at}: ${seats.map((s) => `${s.level ?? 'random'}=${Number((net.get(s.address.toLowerCase())! * 10n) / gem) / 10}`).join(' ')}; decisions ${measures.length}, median ${[...measures].map((m) => m.ms).sort((a, b) => a - b)[Math.floor(measures.length / 2)]} ms`,
			);
			expect(measures).toHaveLength(CYCLES);
			for (const seat of seats) {
				if (seat === seats[at]) continue;
				expect(greedyNet, report.at(-1)).toBeGreaterThan(
					net.get(seat.address.toLowerCase())!,
				);
			}
			await world.dispose();
			world = undefined;
		}
		process.stderr.write(
			`A2 comparison, ${CYCLES} cycles:\n${report.join('\n')}\n`,
		);
	}, 600_000);
});

/**
 * THE PLAYED SEATS AT A TABLE (step OT2, OT2-4): the table's life and no more
 * (nothing committed before its start or after its end), no restake (its
 * stake is fixed once started, so a seat that cannot afford a move commits the
 * empty turn), and every derived move on the table's board.
 */
describe('the played seats at a table in stratagems\u2019 offline world', () => {
	const AT_TABLE = tableOf(3, 1, [], TABLE_SEATS);
	const SEATED = playedByTheWorld(AT_TABLE);

	async function aTable(params: {
		stakeGems: number;
		gapPercent: number;
		cycles: number;
	}) {
		world = await createEmbeddedWorld({
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
			expectedContracts: [...OFFLINE_DEPLOYMENT.expectedContracts],
			provision: async ({node}) => {
				for (const address of [
					HUMAN.address,
					...SEATED.map((p) => p.address),
				]) {
					await node.provider.request({
						method: 'evm_setBalance',
						params: [address, `0x${PLAY_MONEY.toString(16)}`],
					} as never);
				}
			},
		});
		const built = world;
		const worldRecords = built.deployments.get();
		const chain = {
			id: worldRecords.chain.id,
			name: worldRecords.chain.name,
			nativeCurrency: worldRecords.chain.nativeCurrency,
			rpcUrls: {default: {http: [] as string[]}},
		};
		const publicClient = createPublicClient({
			chain,
			transport: custom(built.provider as never),
		});
		const human = createWalletClient({
			account: HUMAN,
			chain,
			transport: custom(built.provider as never),
		});
		const store = new Map<string, string>();
		const opened = await openOfflineTable({
			reader: publicClient as never,
			creator: {
				address: HUMAN.address,
				writeContract: (request) =>
					human.writeContract({
						...request,
						account: HUMAN,
						chain: null,
					} as never),
			},
			factory: gameLobby!.factory(worldRecords).address,
			implementation: gameLobby!.implementation(worldRecords).address,
			storage: {
				getItem: (key) => store.get(key) ?? null,
				setItem: (key, value) => void store.set(key, value),
			},
			storageKey: TABLE_STORAGE_KEY,
			seats: AT_TABLE.length,
			cycles: params.cycles,
			gameOptions: encodeStratagemsOptions(params),
		});
		if (opened.kind !== 'table') throw new Error(opened.reason);
		await stakeForEveryoneAtTheTable({
			env: built.env,
			table: opened.table.address,
			player: HUMAN.address,
			seats: AT_TABLE,
		});
		const atTable = gameLobby!.deploymentsAt(worldRecords, opened.table);
		const records = {
			...readable(atTable),
			get: () => atTable,
		} as DeploymentsStore;
		const table = {
			address: records.get().contracts.Stratagems.address,
			abi: records.get().contracts.Stratagems.abi,
		};
		const stratagems = resolveStratagemsConfig(atTable as never);

		async function send(request: Record<string, unknown>): Promise<void> {
			const hash = await human.writeContract({
				...table,
				chain: null,
				account: HUMAN,
				...request,
			} as never);
			const receipt = await publicClient.waitForTransactionReceipt({hash});
			expect(receipt.status, String(request.functionName)).toBe('success');
		}
		async function read<T>(functionName: string, args: unknown[] = []) {
			return (await publicClient.readContract({
				...table,
				functionName,
				args,
			} as never)) as T;
		}
		const sentBySeats = async () => {
			let total = 0;
			for (const seat of SEATED) {
				total += Number(
					await publicClient.getTransactionCount({address: seat.address}),
				);
			}
			return total;
		};
		function playersOn(board?: {min: number; max: number}) {
			return createOfflinePlayers({
				provider: built.provider,
				deployments: records,
				config: stratagems,
				players: SEATED,
				...(board ? {board} : {}),
			});
		}
		/** The human's half of a cycle: an empty turn committed, then revealed, each phase pushed on. */
		async function humanCycle(players: ReturnType<typeof playersOn>) {
			const secret = HUMAN_SECRET;
			const turn = chainOf([], secret);
			await players.tick();
			await send({
				functionName: 'makeCommitment',
				args: [BigInt(HUMAN.address), turn[0].hash, 0n, zeroAddress],
			});
			await send({functionName: 'advanceCycle', args: []});
			await players.tick();
			await send({
				functionName: 'reveal',
				args: [
					BigInt(HUMAN.address),
					[],
					secret,
					turn[0].furtherActions,
					zeroAddress,
				],
			});
			await send({functionName: 'advanceCycle', args: []});
		}
		return {
			built,
			table,
			records,
			stratagems,
			send,
			read,
			sentBySeats,
			playersOn,
			humanCycle,
			gemsOf: (address: `0x${string}`) =>
				publicClient.readContract({
					address: worldRecords.contracts.TestTokens.address,
					abi: worldRecords.contracts.TestTokens.abi,
					functionName: 'balanceOf',
					args: [address],
				} as never) as Promise<bigint>,
		};
	}

	it('commits nothing before the start, plays the board through its cycles, and nothing after the end', async () => {
		const t = await aTable({stakeGems: 10, gapPercent: 50, cycles: 2});
		// BEFORE THE START: nobody is waited for, and a commit would revert
		const early = t.playersOn();
		await early.tick();
		await early.tick();
		expect(await t.sentBySeats()).toBe(0);

		await t.send({functionName: 'start', args: []});
		const board = await tableBoardAt(t.built.env, t.table.address);
		expect(board).toEqual({min: -3, max: 3});
		const players = t.playersOn(board);

		for (let played = 0; played < 2; played++) {
			const {cycleNumber} = await t.read<Cycle>('getCycle');
			await players.tick();
			for (const seat of SEATED) {
				const onChain = await t.read<Commitment>('getCommitment', [
					seat.identity,
				]);
				expect(onChain.cycleNumber).toBe(cycleNumber);
				const move = turnFor({
					game: t.table.address,
					identity: seat.identity,
					cycleNumber: Number(cycleNumber),
					board,
				});
				const {x, y} = bigIntIDToXY(move[0].position);
				expect(x >= -3 && x <= 3 && y >= -3 && y <= 3).toBe(true);
				const head = chainOf(
					move,
					playedSeatSecret({
						chainId: t.records.get().chain.id,
						contract: t.table.address,
						identity: seat.identity,
						cycleNumber: Number(cycleNumber),
					}),
				)[0].hash;
				expect(onChain.hash.toLowerCase()).toBe(head.toLowerCase());
			}
			await t.humanCycle(players);
		}
		const [, , ended] = await t.read<[bigint, bigint, boolean]>('getEnd');
		expect(ended).toBe(true);

		// AFTER THE END: nothing more is sent, however often the seats look
		const sent = await t.sentBySeats();
		await players.tick();
		await players.tick();
		expect(await t.sentBySeats()).toBe(sent);
	}, 120_000);

	it('commits the empty turn rather than restaking, when its stake cannot cover a move', async () => {
		// one gem a seat: the first move places it, and a table's stake is fixed
		const t = await aTable({stakeGems: 1, gapPercent: 400, cycles: 3});
		await t.send({functionName: 'start', args: []});
		const board = await tableBoardAt(t.built.env, t.table.address);
		const players = t.playersOn(board);
		await t.humanCycle(players);

		const {cycleNumber} = await t.read<Cycle>('getCycle');
		const cost = 10n ** 18n;
		await players.tick();
		let emptied = 0;
		for (const seat of SEATED) {
			const reserve = await t.read<bigint>('getReserve', [seat.identity]);
			const onChain = await t.read<Commitment>('getCommitment', [
				seat.identity,
			]);
			expect(onChain.cycleNumber).toBe(cycleNumber);
			const secret = playedSeatSecret({
				chainId: t.records.get().chain.id,
				contract: t.table.address,
				identity: seat.identity,
				cycleNumber: Number(cycleNumber),
			});
			if (reserve < cost) {
				emptied++;
				expect(onChain.hash.toLowerCase()).toBe(
					chainOf([], secret)[0].hash.toLowerCase(),
				);
				expect(onChain.bond).toBe(0n);
			}
			// and no test gems taken: nothing to restake with
			expect(await t.gemsOf(seat.address)).toBe(0n);
		}
		expect(emptied).toBeGreaterThan(0);
		// the cycle still turns
		await t.humanCycle(players);
		expect((await t.read<Cycle>('getCycle')).cycleNumber).toBe(
			cycleNumber + 1n,
		);
	}, 120_000);
});

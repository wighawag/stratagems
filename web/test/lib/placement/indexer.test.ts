// No `.svelte.` infix, so this runs in the `server` project: node, no DOM.
// webevm's core runs here, so a whole offline world (the chain, the reference
// game's real deploy, two played seats) and an etherfold host folding it are
// testable without a browser; IndexedDB is `fake-indexeddb`.
import 'fake-indexeddb/auto';
import {describe, it, expect, afterEach} from 'vitest';
import {
	createPublicClient,
	createWalletClient,
	custom,
	zeroAddress,
	type Account,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createBrowserStateStore, createIndexerState} from '@etherfold/browser';
import {
	fromEntityProcessor,
	openForWriting,
} from '@etherfold/processor-entities';
import {graphqlQueryHandler} from '@etherfold/graphql/worker';
import {indexInProcess} from 'template-commit-reveal-contracts/utils/indexer.js';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import {
	config,
	extensions,
} from 'template-commit-reveal-contracts/rocketh/config.js';
import {
	OFFLINE_DEPLOYMENT,
	offlineIdentityOf,
	playedByTheWorld,
	stakeForOfflinePlayer,
} from '$lib/offline';
import {
	SEATS_BY_DEFAULT,
	seatsPlayedByTheWorld,
	tableOf,
} from '$lib/game/lobby/seats';
import {costOfPlacements, resolvePlacementConfig} from '$lib/placement/config';
import {buildPlacementChain} from '$lib/placement/commit-reveal';
import {createOfflinePlayers, turnFor} from '$lib/offline-players';
import {cellID, zoneOfCell} from '$lib/placement/cells';
import {placementProcessor} from '$lib/placement/indexer/processor';
import {readBoard, type Part} from '$lib/placement/indexer/queries';
import {indexingSource, STREAM_FINALITY} from '$lib/placement/indexer/source';
import {createIndexedBoard} from '$lib/placement/indexer/board';

/**
 * THE REFERENCE GAME'S INDEXER, held to the contract.
 *
 * A world is played for three cycles by the human and the two seats the world
 * plays, the human placing twice on one cell across cycles and once on a cell a
 * played seat takes too, so the fold has to tell a new claimant from a returning
 * one. Then the processor folds the world's chain two ways, and both are held
 * to what the contract stores:
 *
 * - in this process, over SQLite (`indexInProcess`, what a game's contracts
 *   tests and scripts use), cell by cell against `getCell` and as a SET
 *   against `getCellsInZones`;
 * - through the framework's indexed state (`createIndexedBoard`, the store the
 *   game's composition hands the skeleton), on a host on this thread over a
 *   browser store, which must publish the same board stamped with the chain's
 *   cycle (the world is Manual: the stamp is the folded `CycleAdvanced`).
 */

const CHAIN_ID = 9007199254740131;
const TABLE = tableOf(SEATS_BY_DEFAULT);
const PLAYED = seatsPlayedByTheWorld(TABLE);
const HUMAN = {
	privateKey:
		'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
	address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
} as const;
const PLAY_MONEY = 10n ** 24n;
const SECRET = `0x${'22'.repeat(32)}` as const;

type Cell = {totalStake: bigint; numClaimants: number};
type CellAt = {cellID: bigint; totalStake: bigint; numClaimants: number};
type Sender = {account: Account; client: ReturnType<typeof createWalletClient>};

let world: EmbeddedWorld | undefined;
afterEach(async () => {
	await world?.dispose();
	world = undefined;
});

async function buildWorld() {
	return createEmbeddedWorld({
		chainId: CHAIN_ID,
		chain: {
			name: 'Offline',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			properties: {...config.chains[31337].properties},
		},
		rocketh: {config, extensions},
		environment: OFFLINE_DEPLOYMENT.environment,
		scripts: [...OFFLINE_DEPLOYMENT.scripts],
		data: {...OFFLINE_DEPLOYMENT.data},
		accounts: {...OFFLINE_DEPLOYMENT.accounts},
		initialBalances: {...OFFLINE_DEPLOYMENT.initialBalances},
		provision: async ({env, node}) => {
			for (const address of [
				HUMAN.address,
				...PLAYED.map((played) => played.address),
			]) {
				await node.provider.request({
					method: 'evm_setBalance',
					params: [address, `0x${PLAY_MONEY.toString(16)}`],
				} as never);
				await stakeForOfflinePlayer({env, player: address});
			}
		},
	});
}

/** Three cycles, every seat playing: returns the cells anyone placed on. */
async function playThreeCycles(built: EmbeddedWorld): Promise<bigint[]> {
	const records = built.deployments.get();
	const chain = {
		id: records.chain.id,
		name: records.chain.name,
		nativeCurrency: records.chain.nativeCurrency,
		rpcUrls: {default: {http: [] as string[]}},
	};
	const game = {
		address: records.contracts.Game.address,
		abi: records.contracts.Game.abi,
	};
	const publicClient = createPublicClient({
		chain,
		transport: custom(built.provider as never),
	});
	const account = privateKeyToAccount(HUMAN.privateKey);
	const human: Sender = {
		account,
		client: createWalletClient({
			account,
			chain,
			transport: custom(built.provider as never),
		}),
	};
	async function send(request: Record<string, unknown>): Promise<void> {
		const hash = await human.client.writeContract({
			...game,
			chain: null,
			account: human.account,
			...request,
		} as never);
		const receipt = await publicClient.waitForTransactionReceipt({hash});
		expect(receipt.status, String(request.functionName)).toBe('success');
	}

	const placement = resolvePlacementConfig(records);
	const players = createOfflinePlayers({
		provider: built.provider,
		deployments: built.deployments,
		config: placement,
		players: await playedByTheWorld({env: built.env, table: TABLE}),
	});
	const played = await playedByTheWorld({env: built.env, table: TABLE});
	const identity = await offlineIdentityOf({
		env: built.env,
		player: HUMAN.address,
	});

	const touched = new Set<bigint>();
	for (let cycle = 2; cycle <= 4; cycle++) {
		// the first played seat's cell this cycle, shared with the human
		const [theirs] = turnFor({
			game: records.contracts.Game.address,
			identity: played[0].identity,
			cycleNumber: cycle,
		});
		const turn = [{cellID: cellID(20, 20)}, {cellID: theirs.cellID}];
		for (const seat of played) {
			for (const action of turnFor({
				game: records.contracts.Game.address,
				identity: seat.identity,
				cycleNumber: cycle,
			})) {
				touched.add(action.cellID);
			}
		}
		for (const action of turn) touched.add(action.cellID);
		const links = buildPlacementChain({
			actions: turn,
			secret: SECRET,
			actionsPerReveal: placement.actionsPerReveal,
		});
		expect(links).toHaveLength(1);

		await players.tick();
		await send({
			functionName: 'makeCommitment',
			args: [
				identity,
				links[0].hash,
				costOfPlacements(placement, turn.length),
				zeroAddress,
			],
		});
		await send({functionName: 'advanceCycle', args: []});
		await players.tick();
		await send({
			functionName: 'reveal',
			args: [identity, turn, SECRET, links[0].furtherActions, zeroAddress],
		});
		await send({functionName: 'advanceCycle', args: []});
	}
	return [...touched];
}

function readerOf(built: EmbeddedWorld) {
	const records = built.deployments.get();
	const publicClient = createPublicClient({
		transport: custom(built.provider as never),
	});
	const game = {
		address: records.contracts.Game.address,
		abi: records.contracts.Game.abi,
	};
	return {
		publicClient,
		read: async <T>(functionName: string, args: unknown[] = []) =>
			(await publicClient.readContract({
				...game,
				functionName,
				args,
			} as never)) as T,
	};
}

const ALL: ReadonlySet<Part> = new Set(['cells', 'advancedCycle']);

describe("the reference game's indexer", () => {
	it('folds a played world into the board the contract stores', async () => {
		world = await buildWorld();
		const touched = await playThreeCycles(world);
		const {read} = readerOf(world);
		const records = world.deployments.get();

		const indexed = await indexInProcess({
			processor: placementProcessor,
			provider: world.provider as never,
			source: indexingSource(records as never) as never,
			finality: STREAM_FINALITY,
		});
		const {data} = await readBoard(indexed.execute, ALL);
		indexed.close();

		// every cell anyone placed on, field by field
		for (const id of touched) {
			const stored = await read<Cell>('getCell', [id]);
			expect(data.cells.get(id), String(id)).toEqual({
				cellID: id,
				totalStake: stored.totalStake,
				numClaimants: Number(stored.numClaimants),
			});
		}
		// a cell the human took in each of three cycles counts one claimant
		const shared = data.cells.get(cellID(20, 20));
		expect(shared?.numClaimants).toBe(1);
		expect(shared?.totalStake).toBe(
			3n * resolvePlacementConfig(records).placementCost,
		);
		expect([...data.cells.values()].some((c) => c.numClaimants >= 2)).toBe(
			true,
		);

		// and the board as a SET: what the zones hold is what was folded
		const zones = [...new Set([...data.cells.keys()].map(zoneOfCell))];
		const [inZones] = await read<[readonly CellAt[], bigint]>(
			'getCellsInZones',
			[zones],
		);
		expect(new Set(inZones.map((c) => c.cellID))).toEqual(
			new Set(data.cells.keys()),
		);

		// the cycle the last push left: three cycles of two pushes from 2
		const cycle = await read<{cycleNumber: bigint}>('getCycle');
		expect(data.advancedCycle).toBe(Number(cycle.cycleNumber));
		expect(data.advancedCycle).toBe(5);
	});

	it("publishes the same board through the framework's indexed state, stamped with the chain's cycle", async () => {
		world = await buildWorld();
		await playThreeCycles(world);
		const records = world.deployments.get();
		const {publicClient} = readerOf(world);

		const store = await createBrowserStateStore(placementProcessor.entities, {
			databaseName: `placement-indexer-test-${Date.now()}`,
		});
		const indexer = createIndexerState({
			createState: async (_context, {signal}) =>
				openForWriting(store, {signal}),
			createProcessor: (state) =>
				fromEntityProcessor(placementProcessor)(state),
		});
		await indexer.init({
			provider: world.provider as never,
			source: indexingSource(records as never) as never,
			config: {stream: {finality: STREAM_FINALITY}},
		});
		await indexer.indexToLatest();

		const board = createIndexedBoard({
			provider: world.provider as never,
			publicClient,
			deployments: records as never,
			cycle: resolvePlacementConfig(records).cycle,
			host: () => indexer.mainThreadHost({query: graphqlQueryHandler()}),
		});
		type Value = Parameters<Parameters<typeof board.subscribe>[0]>[0];
		let value = {step: 'Unloaded'} as Value;
		const stop = board.subscribe((next) => (value = next));
		await board.update();
		for (let i = 0; i < 100 && value.step !== 'Loaded'; i++) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		stop();
		await indexer.dispose?.();

		expect(value.step).toBe('Loaded');
		if (value.step !== 'Loaded') return;
		expect(value.cycleNumber).toBe(5);
		const indexed = await indexInProcess({
			processor: placementProcessor,
			provider: world.provider as never,
			source: indexingSource(records as never) as never,
		});
		const {data} = await readBoard(indexed.execute, ALL);
		indexed.close();
		expect(value.cells).toEqual(data.cells);
		expect(value.cells.size).toBeGreaterThan(0);
	});
});

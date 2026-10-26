// No `.svelte.` infix, so this runs in the `server` project: node, no DOM, and
// webevm's core runs there, so a whole offline world (the chain, stratagems'
// real deploy) and an etherfold host folding it are testable without a browser.
//
// THE MEASUREMENT STEP O's DESIGN RESTS ON (item 2 of the step, in
// work/plans/join-template-commit-reveal.md): does an etherfold host, over the
// node's provider, reach the tip of an automined chain after each transaction,
// `CycleAdvanced` included, with the stream's finality at 12? It does. Two
// findings came with it: webevm's logs carried no `blockTimestamp`, which
// etherfold requires (fixed at its home, webevm 0.9.0, the first case below
// pins it), and an in-memory etherfold store answers no query (the second).
import 'fake-indexeddb/auto';
import {describe, it, expect, afterEach} from 'vitest';
import {
	createPublicClient,
	createWalletClient,
	custom,
	parseEther,
	zeroAddress,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {config, extensions} from 'stratagems-contracts/rocketh/config.js';
import deployTestTokens from 'stratagems-contracts/deploy/001_deploy_test_tokens.js';
import deployDistributor from 'stratagems-contracts/deploy/002_deploy_test_tokens_distributor.js';
import deployGems from 'stratagems-contracts/deploy/010_deploy_gems.js';
import deployGenerator from 'stratagems-contracts/deploy/011_deploy_gems_generator.js';
import deployGame from 'stratagems-contracts/deploy/020_deploy_game.js';
import {
	connectToIndexerHost,
	createBrowserStateStore,
	createIndexerState,
} from '@etherfold/browser';
import {MemoryStateStore} from '@etherfold/state-store';
import {
	fromEntityProcessor,
	openForWriting,
} from '@etherfold/processor-entities';
import {graphqlQueryHandler, workerExecutor} from '@etherfold/graphql/worker';
import {
	indexingSource,
	readState,
	stratagemsProcessor,
	STREAM_FINALITY,
} from 'stratagems-indexer';
import {prepareCommitment, xyToBigIntID} from 'stratagems-common';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';

// hardhat's well-known development keys: deployer, tokensBeneficiary, a player
const KEYS = [
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
	'0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
] as const;

let world: EmbeddedWorld | undefined;
afterEach(async () => {
	await world?.dispose();
	world = undefined;
});

async function bootWorld(): Promise<EmbeddedWorld> {
	return createEmbeddedWorld({
		chainId: 9007199254740123,
		chain: {
			name: 'Offline',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			properties: {...config.chains[31337].properties},
		},
		rocketh: {config: config as never, extensions},
		environment: 'offline',
		scripts: [
			{id: '001_deploy_test_tokens', module: deployTestTokens},
			{id: '002_deploy_test_tokens_distributor', module: deployDistributor},
			{id: '010_deploy_gems', module: deployGems},
			{id: '011_deploy_gems_generator', module: deployGenerator},
			{id: '020_deploy_game', module: deployGame},
		],
		accounts: {
			deployer: KEYS[0],
			tokensBeneficiary: KEYS[1],
			timeOwner: KEYS[0],
		},
		initialBalances: Object.fromEntries(
			KEYS.map((key) => [privateKeyToAccount(key).address, 10n ** 24n]),
		),
	});
}

type Contract = {address: `0x${string}`; abi: readonly unknown[]};

function contractsOf(w: EmbeddedWorld) {
	const deployments = w.deployments.get() as unknown as {
		chain: {id: number};
		contracts: Record<
			string,
			Contract & {linkedData?: Record<string, unknown>}
		>;
	};
	return deployments;
}

describe('the offline world, folded by etherfold', () => {
	it('deploys with the Manual policy, and every log carries its block\u2019s timestamp', async () => {
		world = await bootWorld();
		const deployments = contractsOf(world);
		const linked = deployments.contracts.Stratagems.linkedData!;
		expect(Number(linked.cyclePolicy)).toBe(1);
		expect(BigInt(linked.commitPhaseDuration as string)).toBe(0n);
		expect(BigInt(linked.revealPhaseDuration as string)).toBe(0n);

		const logs = (await world.provider.request({
			method: 'eth_getLogs',
			params: [
				{
					address: deployments.contracts.Stratagems.address,
					fromBlock: '0x0',
					toBlock: 'latest',
				},
			],
		})) as {blockHash: string; blockTimestamp?: string}[];
		expect(logs.length).toBeGreaterThan(0);
		// execution-apis#639, which etherfold requires (`TimestamplessLogError`):
		// absent from webevm up to 0.8.0, served since 0.9.0
		for (const log of logs) {
			const block = (await world.provider.request({
				method: 'eth_getBlockByHash',
				params: [log.blockHash, false],
			})) as {timestamp: string};
			expect(log.blockTimestamp).toBe(block.timestamp);
		}
	});

	it('an in-memory store folds, but cannot answer the GraphQL the board reads with', async () => {
		world = await bootWorld();
		const store = new MemoryStateStore(stratagemsProcessor.entities);
		const indexer = createIndexerState({
			createState: async (_context, {signal}) =>
				openForWriting(store as never, {signal}),
			createProcessor: (state) =>
				fromEntityProcessor(stratagemsProcessor)(state),
		});
		await indexer.init({
			provider: world.provider as never,
			source: indexingSource(contractsOf(world) as never) as never,
			config: {stream: {finality: STREAM_FINALITY}},
		});
		await indexer.indexToLatest();
		const port = connectToIndexerHost(
			indexer.mainThreadHost({query: graphqlQueryHandler()}),
			{watch: false} as never,
		);
		// THE SECOND FINDING: `MemoryStateStore` is a backend without the query seam
		// (no `accessor`, `tip`, `blockAt`, `blockOf`, `revertSequence`), so the
		// handler answers every query `internal-error`
		await expect(readState(workerExecutor(port) as never)).rejects.toThrow(
			/internal-error/,
		);
		port.close();
	});

	it('an IndexedDB store reaches the tip after every transaction of a manual cycle, CycleAdvanced included', async () => {
		world = await bootWorld();
		const deployments = contractsOf(world);
		const Stratagems = deployments.contracts.Stratagems;
		const provider = world.provider as never;
		const publicClient = createPublicClient({transport: custom(provider)});
		const walletOf = (key: `0x${string}`) =>
			createWalletClient({
				account: privateKeyToAccount(key),
				chain: {id: deployments.chain.id} as never,
				transport: custom(provider),
			});

		const store = await createBrowserStateStore(stratagemsProcessor.entities, {
			databaseName: `offline-indexer-test-${Date.now()}`,
		});
		const indexer = createIndexerState({
			createState: async (_context, {signal}) =>
				openForWriting(store, {signal}),
			createProcessor: (state) =>
				fromEntityProcessor(stratagemsProcessor)(state),
		});
		await indexer.init({
			provider: world.provider as never,
			source: indexingSource(deployments as never) as never,
			config: {stream: {finality: STREAM_FINALITY}},
		});
		const port = connectToIndexerHost(
			indexer.mainThreadHost({query: graphqlQueryHandler()}),
			{watch: false} as never,
		);
		const execute = workerExecutor(port) as never;

		const tips: {step: string; block: number; folded: number}[] = [];
		async function send(
			step: string,
			key: `0x${string}`,
			functionName: string,
			args: unknown[],
		) {
			const hash = await walletOf(key).writeContract({
				address: Stratagems.address,
				abi: Stratagems.abi,
				functionName,
				args,
			} as never);
			const receipt = await publicClient.waitForTransactionReceipt({hash});
			expect(receipt.status, step).toBe('success');
			await indexer.indexToLatest();
			const folded = (indexer.syncing.$state.lastSync as {lastToBlock?: number})
				?.lastToBlock;
			tips.push({
				step,
				block: Number(receipt.blockNumber),
				folded: folded ?? -1,
			});
		}

		const player = privateKeyToAccount(KEYS[2]).address;
		const stake = parseEther('32');
		const turn = prepareCommitment(
			[{position: xyToBigIntID(1, 1), color: 1}],
			`0x${'11'.repeat(32)}`,
		);
		await send('stake', KEYS[1], 'addToReserve', [BigInt(player), stake]);
		await send('commit', KEYS[2], 'makeCommitment', [
			BigInt(player),
			turn.hash,
			stake,
			zeroAddress,
		]);
		await send('advance to reveal', KEYS[2], 'advanceCycle', []);
		await send('reveal', KEYS[2], 'reveal', [
			BigInt(player),
			turn.moves,
			turn.secret,
			turn.furtherActions,
			zeroAddress,
		]);
		await send('advance to commit', KEYS[2], 'advanceCycle', []);

		// every transaction folded at once: the stream's finality (12) delays nothing
		for (const tip of tips) expect(tip.folded, tip.step).toBe(tip.block);

		const {data} = await readState(execute);
		const position = xyToBigIntID(1, 1).toString();
		expect(data.owners[position]?.toLowerCase()).toBe(player.toLowerCase());
		expect(data.cells[position]?.color).toBe(1);
		port.close();
	});
});

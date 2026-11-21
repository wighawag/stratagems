import {get, type Readable} from 'svelte/store';
import {config, extensions} from 'stratagems-contracts/rocketh/config.js';
import deployTestTokens from 'stratagems-contracts/deploy/001_deploy_test_tokens.js';
import deployDistributor from 'stratagems-contracts/deploy/002_deploy_test_tokens_distributor.js';
import deployGems from 'stratagems-contracts/deploy/010_deploy_gems.js';
import deployGenerator from 'stratagems-contracts/deploy/011_deploy_gems_generator.js';
import deployGame from 'stratagems-contracts/deploy/020_deploy_game.js';
import deployTables from 'stratagems-contracts/deploy/021_deploy_tables.js';
import {expectedContractNames, type EmbeddedWorld} from '$lib/embedded';
import {
	createOfflineBoot,
	openOfflineWorld,
	type OfflineBootStatus,
} from '$lib/offline-world';
import {createContext, lobby as gameLobby} from '$lib/context/index';
import type {Context} from '$lib/context/types';
import {createOfflinePlayers, type OfflinePlayer} from '$lib/offline-players';
import {createPublicClient, custom} from 'viem';
import type {TableChoice} from '$lib/game/lobby/lobby';
import {offlineSeatLabels} from '$lib/game/lobby/offline-table';
import {settleOnceEnded} from '$lib/stratagems/table-end';
import type {BoardBounds} from '$lib/stratagems/strategy';
import {createPlayedTurnStore, RANDOM_LEVEL} from '$lib/game/core/strategy';
import {createBytecodeSandbox} from '$lib/game/simulation';
import {
	createStratagemsStrategy,
	STRATAGEMS_LEVELS,
	type DecisionMeasure,
	type StratagemsSimulator,
} from '$lib/stratagems/strategy';
import {STRATAGEMS_STORAGE} from '$lib/stratagems/submission-storage';
import {defaultColorOf} from '$lib/stratagems/faction';
import type {StoredCell} from '$lib/stratagems/preview';
import {
	MOST_SEATS,
	humansAtThisDevice,
	seatsPlayedByTheWorld,
	type Table,
} from '$lib/game/lobby/seats';
import {showHotseat} from '$lib/game/lobby/hotseat';
import {
	createOfflineWallet,
	giveGas,
	handOverBetweenThem,
	holdTheWorldOnTheConsole,
	openTheWorldsTable,
	readyToPlay,
	revealerForTheHumans,
	seatTheHumans,
	stakeEverySeat,
	theWorldsGame,
	type TableAt,
	type WorldNodeProvider,
} from '$lib/game/offline';
import {forgetPreviousWorldIndex} from '$lib/game/offline/world-index';
import {resolveStratagemsConfig} from '$lib/stratagems/game-config';
import {INDEXER_PREFIX} from '$lib/stratagems/board/prefix';

/**
 * STRATAGEMS' OFFLINE WORLD: the composition, which is the half `$lib/embedded`
 * deliberately does not have (which scripts, what the deployment declares, what
 * each seat is given).
 *
 * SAME PATH AS THE TEMPLATE'S, AND STRATAGEMS' OWN CONTENT, as reveal-or-die
 * does (step O, P1, of work/plans/join-template-commit-reveal.md): the content
 * has to diverge (this game's contracts, its stake, its moves), and a conflict
 * at a file both sides have is a diff a human can read. The template's file is
 * the long-form argument for every choice below; what follows says where
 * stratagems' answer differs and why.
 *
 * WHAT IT DECIDES:
 *
 * 1. **The MANUAL cycle policy, both durations zero**, for the template's
 *    reasons (a world is the human's to pace, and an automined chain has no
 *    clock between transactions). Stratagems' deploy does not read `data`: it
 *    branches on the environment's NAME, so the world deploys under its own
 *    environment, `offline`, which `020_deploy_game.ts` turns into the Manual
 *    policy (P2). Everything else (the gas, the chunk, the life) is the deploy's
 *    own, as on every chain.
 * 2. **What is deployed** (P3): the tokens, the distributor, the gems, their
 *    generator and the game. No `Time` contract (no local deploy has one since
 *    step O, and the Manual policy reads no clock).
 * 3. **What each seat is given** (P4): gas, by cheat call, on every boot; and a
 *    stake of `stakeAmount` (one chunk of gems), credited by the tokens'
 *    beneficiary with `addToReserve`, ONLY when the chain says the seat has none,
 *    so a stake is never refillable by F5. The human's browser key is authorised
 *    by the world after sign-in and given gas like every seat, since offline it
 *    also pushes the manual cycle.
 * 4. **Who else is in it**: the table the lobby laid out, played by
 *    `$lib/offline-players`, which tops a seat up from the distributor rather
 *    than freezing the board when its gems run out (P5).
 * 5. **Hotseat** (step H2): several people at this device, as many as the
 *    lobby was told when the world was created (`LOCAL_HUMANS_AT_MOST` is the
 *    cap), each their own account in the world's wallet, staked, authorised and
 *    their browser key funded like the one human's; a local revealer sends their
 *    reveals, and the framework's handover passes the device between them
 *    (`$lib/game/lobby/hotseat`). The composition is the template's world's.
 * 6. **A table** (step OT2): the lobby's default, a game for the seats chosen,
 *    on the world's chain and the world's clock (`021_deploy_tables.ts` runs
 *    the Manual cycle under `offline`), created by the first person's account,
 *    every seat staked AT IT by the tokens' beneficiary with exactly the
 *    table's stake (nobody in the world's `Stratagems`), started by the tab,
 *    and settled by the tab once it has ended (`settleOnceEnded`). The
 *    framework does the creating, finding again and starting, who creates it
 *    and how its panel names the seats (`$lib/game/lobby/offline-table`, the
 *    boot's shared half since step OT3); what is here is stratagems' stake
 *    and its board.
 *
 * THE WORLD'S BOARD IS INDEXED IN THIS TAB, by its own worker and into a
 * database of its own kept across reloads (`$lib/indexer/worker-choice`, P8). Its
 * index is deleted when a new world replaces it (see `forgetPreviousWorldIndex`).
 */

/**
 * The keys the deploy signs with: hardhat's well-known development accounts,
 * PUBLIC AND FIXED on purpose (the template's argument: the chain exists only
 * in this tab, and fixed keys keep a world's addresses the same between runs).
 * The player does not use these; they play through the announced wallet.
 */
const DEPLOYER =
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const DEPLOYER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
/** Holds the 10^9 test gems `001` mints, and stakes for every seat. */
const BENEFICIARY =
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const BENEFICIARY_ADDRESS =
	'0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

/**
 * Where the id of the world in this browser is kept. EXPORTED because the lobby
 * forgets it to end a world (`$lib/offline-lobby`).
 */
export const CHAIN_ID_STORAGE_KEY = 'offline-world:chain-id';
/**
 * Where the address of the world's TABLE is kept, when the world is a table
 * (`$lib/game/lobby/offline-table`): the framework's key, written as soon as
 * the table is created, checked against the chain on every boot after, and
 * forgotten with the world by the lobby, which reads it off this module. A
 * WIRE since step OT1.
 */
export const TABLE_STORAGE_KEY = 'offline-world:table';
const PLAY_MONEY = 10n ** 24n;

/**
 * HOTSEAT: how many people at this device this world can play, each their own
 * account in the world's wallet. Every seat may be one (H2-2: how many is
 * chosen when the world is created; this is only the cap). Read by the
 * byte-identical lobby off this module (`$lib/offline-lobby`).
 */
export const LOCAL_HUMANS_AT_MOST = MOST_SEATS;

/**
 * THE LEVELS A WORLD SEAT MAY PLAY AT, chosen per seat at the lobby (step A2):
 * `random` (today's derived turn, the default) and `greedy`
 * (`$lib/stratagems/strategy`). Read by the byte-identical lobby off this
 * module, as `LOCAL_HUMANS_AT_MOST` is.
 */
export const AI_LEVELS = STRATAGEMS_LEVELS;

/**
 * Where a played seat's decided turn is kept, beside this world's other keys:
 * a storage that lost it has lost the chain id too, and so the world. A WIRE
 * from its first build (step A2), like the record it holds
 * (`$lib/game/core/strategy`).
 */
export const PLAYED_TURNS_STORAGE_KEY = 'offline-world:played-turns';

/**
 * THE DEPLOYMENT AN OFFLINE GAME IS, as one exported value, so the world test
 * deploys exactly what this file deploys.
 */
export const OFFLINE_DEPLOYMENT = {
	/**
	 * The environment NAME, which is what `020_deploy_game.ts` and
	 * `002_deploy_test_tokens_distributor.ts` branch on. Its own rather than
	 * `localhost`, so what an offline game is cannot change what a developer's
	 * local chain is.
	 */
	environment: 'offline',
	scripts: [
		{id: '001_deploy_test_tokens', module: deployTestTokens},
		{id: '002_deploy_test_tokens_distributor', module: deployDistributor},
		{id: '010_deploy_gems', module: deployGems},
		{id: '011_deploy_gems_generator', module: deployGenerator},
		{id: '020_deploy_game', module: deployGame},
		// THE TABLES, which an offline world plays too (`startOfflineTable`), on
		// the world's Manual cycle under this environment (OT2-1)
		{id: '021_deploy_tables', module: deployTables},
	],
	accounts: {
		deployer: DEPLOYER,
		tokensBeneficiary: BENEFICIARY,
		// the owner of a `Time` contract, which no offline deploy has; named
		// because the config declares it
		timeOwner: DEPLOYER,
	},
	initialBalances: {
		[DEPLOYER_ADDRESS]: PLAY_MONEY,
		[BENEFICIARY_ADDRESS]: PLAY_MONEY,
	},
	/** What must exist afterwards: everything the app was built against, the tables included. */
	expectedContracts: expectedContractNames(),
} as const;

/** What a `Ready` world carries as its `context`: the context, and what starts with the board. */
type OfflineWorldContext = {context: Context; start: () => () => void};

export type OfflineWorldStatus = OfflineBootStatus<{
	world: EmbeddedWorld;
	context: OfflineWorldContext;
}>;

/**
 * THE WORLD'S OWN WALLET, announced at provisioning: the world switches its
 * accounts in hotseat (`$lib/game/offline`'s `createOfflineWallet`).
 */
const wallet = createOfflineWallet();

/**
 * APP-SCOPED AND LAZY: nothing happens at import time (the app prerenders), and
 * a world is STATE, so it outlives any route that shows it
 * (`$lib/offline-world`'s `createOfflineBoot`).
 */
const boot = createOfflineBoot(
	(booting, table: Table, at: TableAt | undefined) =>
		buildOfflineWorld(booting, table, at),
);

/** What the page renders. */
export const offlineWorld: Readable<OfflineWorldStatus> = boot.status;

export function startOfflineWorld(params: {
	/** Everyone this world will wait for, chosen at the lobby. */
	table: Table;
}): Promise<OfflineWorldStatus> {
	return boot.start(params.table, undefined);
}

/**
 * A TABLE IN THIS WORLD (step OT2): a game for the seats chosen, created by the
 * first person's account, every seat staked at it, started by the tab, ended
 * after `cycles` and settled by the tab. Read by the byte-identical lobby off
 * this module (`$lib/offline-lobby`): exporting it is what offers a table
 * offline, and a game with online tables must
 * (`test/offline-tables-boundary.test.ts`). The world's own `Stratagems` is
 * deployed beside it, and nobody is staked there.
 */
export function startOfflineTable(
	choice: TableChoice,
): Promise<OfflineWorldStatus> {
	return boot.start(choice.table, {
		cycles: choice.cycles,
		gameOptions: choice.gameOptions,
	});
}

/**
 * STRATAGEMS' WORLD, composed of the steps every commit-reveal game's world
 * takes (`$lib/game/offline`) around what is stratagems': its deployment, its
 * stake, its contract's name, its board at a table, the keys it funds, its
 * index and its table settled by the tab.
 */
async function buildOfflineWorld(
	booting: (what: string) => void,
	table: Table,
	at: TableAt | undefined,
): Promise<{world: EmbeddedWorld; context: OfflineWorldContext}> {
	// Minted once and remembered: it keys everything the player keeps (the
	// operations ledger, the submission storage, the world's index).
	const world = await openOfflineWorld({
		chainIdKey: CHAIN_ID_STORAGE_KEY,
		deployment: {
			rocketh: {config: config as never, extensions},
			environment: OFFLINE_DEPLOYMENT.environment,
			scripts: [...OFFLINE_DEPLOYMENT.scripts],
			accounts: {...OFFLINE_DEPLOYMENT.accounts},
			initialBalances: {...OFFLINE_DEPLOYMENT.initialBalances},
			expectedContracts: [...OFFLINE_DEPLOYMENT.expectedContracts],
		},
		// THE LOCAL CHAIN'S OWN PROPERTIES (step S): `expectedWorstGasPrice`
		// sizes the stake's stipend and `creditsGasMultiplier` shows the key's
		// gas as moves left, so they are read from the deploy config, not typed
		// again. The block time and the finality are the opener's.
		chainProperties: config.chains[31337].properties,
		provision: (params) =>
			provisionOfflinePlayer({
				...params,
				table,
				atTable: !!at,
				onStep: booting,
			}),
		onStep: booting,
	});
	// THE INDEX OF A WORLD THE LOBBY FORGOT, deleted now that another starts
	// (`$lib/game/offline/world-index`).
	forgetPreviousWorldIndex({
		prefix: INDEXER_PREFIX,
		chainId: world.deployments.get().chain.id,
	});
	const humans = humansAtThisDevice(table);

	// WHERE THE GAME IS: the world's `Stratagems`, or the world's TABLE. At a
	// table everything below is composed on the table's record (the lobby's
	// `deploymentsAt`: `Stratagems` at the table's address, its simulation and
	// `NoRewards`), so the context, the revealer, the handover, the played seats
	// and their strategy all play the table (the template's worked example).
	let where = theWorldsGame(world);
	let board: BoardBounds | undefined;
	if (at) {
		const opened = await openTheWorldsTable({
			world,
			wallet,
			lobby: gameLobby,
			table,
			at,
			stake: (resolved) =>
				stakeForEveryoneAtTheTable({
					env: world.env,
					table: resolved.address,
					player: wallet.current()!.accounts[0],
					humans: wallet.current()!.accounts,
					seats: table,
				}),
			chainIdKey: CHAIN_ID_STORAGE_KEY,
			storageKey: TABLE_STORAGE_KEY,
			onStep: booting,
		});
		// A refused table let go of this world and remembered a new id: build
		// again, which opens the new one.
		if (opened.kind === 'incoherent') {
			return buildOfflineWorld(booting, table, at);
		}
		where = opened;
		// ITS BOARD, read once it has started, for the played seats (OT2-4c).
		board = await tableBoardAt(world.env, opened.table.address);
	}
	const {records} = where;

	// WHO REVEALS FOR THE PEOPLE AT THIS DEVICE, in a hotseat world, on
	// stratagems' contract (`revealerForTheHumans`). One person needs none.
	let pokeAdvance = () => {};
	const revealer = revealerForTheHumans({
		world,
		records,
		humans,
		onActed: () => pokeAdvance(),
		contract: GAME_CONTRACT,
	});

	booting('connecting');

	// SYNCHRONOUS, AND AFTER THE WORLD: the context reads the deployment while
	// constructing (the template's argument).
	// THE AI SEATS' DECISIONS, measured (step A2, A2-8): read by the e2e off the
	// console handle below, and by nothing else.
	const decisions: DecisionMeasure[] = [];

	const context = createContext({
		establishConnection: where.establishConnection,
		...(revealer ? {scheduler: revealer.scheduler} : {}),
		// AT A TABLE the context is the table's, with its roster and its
		// creator's powers, its seats named as the lobby named them.
		...(where.table
			? {
					table: where.table,
					seatLabels: await offlineSeatLabels({
						table,
						accounts: wallet.current()?.accounts,
						identityOf: offlineIdentityOf,
						levels: AI_LEVELS,
					}),
				}
			: {}),
	});
	pokeAdvance = () => void context.context.game.cycleAdvance.check();
	// how long each AI seat's decision took (step A2, A2-8), for the e2e
	holdTheWorldOnTheConsole({world, context: context.context, decisions});

	// EVERY PERSON HERE SEATED (`seatTheHumans`): connected, signed in, their
	// browser key authorised and, stratagems' own step, funded now rather than
	// at their first handover, so no turn opens on a transaction.
	const seated = await seatTheHumans({
		context: context.context,
		wallet: wallet.current(),
		humans,
		identityOf: offlineIdentityOf,
		afterAuthorising: () => fundTheBrowsersKey(world, context.context),
		onStep: booting,
	});
	const hotseat = handOverBetweenThem({
		seated,
		wallet: wallet.current(),
		revealer,
		context: context.context,
		world,
		records,
		contract: GAME_CONTRACT,
	});

	// THE OTHER PLAYERS, started with the board and stopped with it.
	const played = playedByTheWorld(table);
	const decider = playedSeatDecider(
		{provider: world.provider, deployments: records},
		played,
		{
			onDecided: (measure) => decisions.push(measure),
			...(board ? {board} : {}),
		},
	);
	const players = createOfflinePlayers({
		provider: world.provider,
		deployments: records,
		config: resolveStratagemsConfig(records.get() as never),
		players: played,
		// A played commit can complete unanimity just as the human's can.
		onActed: () => void context.context.game.cycleAdvance.check(),
		...(decider ? {strategy: decider.strategy, turns: decider.turns} : {}),
		...(board ? {board} : {}),
	});
	// THE END OF A TABLE, settled by the tab (OT2-5): the HUD's own settlement,
	// sent once it has ended, by the person signed in.
	const tableEnd = (
		context.context.game as {tableEnd?: Parameters<typeof settleOnceEnded>[0]}
	).tableEnd;

	showHotseat(hotseat);
	return {
		world,
		context: readyToPlay({
			context,
			players,
			revealer,
			hotseat,
			decider,
			also: tableEnd ? [() => settleOnceEnded(tableEnd)] : [],
		}),
	};
}

/** Stratagems' game contract, by its deployment name: what the revealer and the handover read. */
const GAME_CONTRACT = 'Stratagems';

/**
 * GIVE THE SIGNED-IN PERSON'S BROWSER KEY PLAY MONEY, as every seat
 * (reveal-or-die's finding, measured in bomber-world): offline the key also
 * pushes the manual cycle, twice a cycle, which the authorisation's one online
 * top-up does not cover. Gas is free here, so this is set on every boot, for
 * every person (`seatTheHumans`' `afterAuthorising`).
 */
async function fundTheBrowsersKey(
	world: EmbeddedWorld,
	context: Context,
): Promise<void> {
	const signer = get(context.signerExecutor);
	if (signer.status === 'ready') {
		await giveGas(world.provider, signer.address, PLAY_MONEY);
	}
}

/**
 * THE TABLE'S BOARD, as its contract plays it (`getBoard()`, inclusive), once
 * it has started; nothing before (all zero). Exported for the world test.
 */
export async function tableBoardAt(
	env: EmbeddedWorld['env'],
	table: `0x${string}`,
): Promise<BoardBounds | undefined> {
	const e = env as unknown as {
		get: (name: string) => {abi: unknown};
		read: (deployment: never, args: unknown) => Promise<unknown>;
	};
	const [min, max, side] = (await e.read(
		{
			address: table,
			abi: e.get('StratagemsTableImplementation').abi,
		} as never,
		{functionName: 'getBoard'},
	)) as readonly [number, number, bigint];
	return side === 0n ? undefined : {min: Number(min), max: Number(max)};
}

/**
 * WHAT AN OFFLINE PLAYER OF STRATAGEMS IS GIVEN: a wallet (the world's own),
 * gas for every seat (on every boot: gas is a number in a tab; both
 * `createOfflineWallet`'s), and a stake for every seat (only when it has none:
 * a stake is what is at risk). The human's browser key is not known yet here;
 * the world authorises it after sign-in.
 */
async function provisionOfflinePlayer(params: {
	env: EmbeddedWorld['env'];
	node: {provider: WorldNodeProvider};
	chainId: number;
	table: Table;
	/**
	 * Whether the world is a TABLE: then nobody is staked in the world's
	 * `Stratagems`, and every seat is staked at the table once it exists (after
	 * the deploy, `openTheWorldsTable`).
	 */
	atTable: boolean;
	onStep: (what: string) => void;
}) {
	const {env, node, table} = params;

	params.onStep('handing the player a wallet');
	const announced = await wallet.announce({
		provider: node.provider,
		chainId: params.chainId,
		table,
		gas: PLAY_MONEY,
	});

	if (!params.atTable) {
		params.onStep('staking for everyone at the table');
		await stakeForEveryoneInTheWorld({
			env,
			player: announced.accounts[0],
			humans: announced.accounts,
			table,
		});
	}

	return {wallets: [announced.handle]};
}

/**
 * GIVE EVERY SEAT AT THE TABLE SOMETHING TO LOSE: stratagems' stake at each
 * seat of `$lib/game/offline`'s walk (`stakeEverySeat`). Exported because it
 * is the half of provisioning that runs in node, and the world test calls
 * exactly this (and counts the waited-for members off `getAttendance`).
 */
export async function stakeForEveryoneInTheWorld(params: {
	env: EmbeddedWorld['env'];
	/** The human's address, which exists once the wallet is announced. */
	player: `0x${string}`;
	/**
	 * Every person at this device, by their account in the world's wallet (a
	 * `local-human` seat names its index here). Absent, the table has none.
	 */
	humans?: readonly `0x${string}`[];
	table: Table;
}): Promise<void> {
	await stakeEverySeat({
		table: params.table,
		you: params.player,
		...(params.humans ? {humans: params.humans} : {}),
		stake: ({player}) => stakeForOfflinePlayer({env: params.env, player}),
	});
}

/**
 * GIVE EVERY SEAT AT THE WORLD'S TABLE A SEAT (OT2-2): exactly the table's
 * stake (`getTableOptions`, the one amount its `addToReserve` takes before the
 * start), credited by the tokens' beneficiary, which is what makes a member of
 * a closed roster, for each seat as {@link stakeForEveryoneInTheWorld} walks
 * them, unless the seat's reserve AT THE TABLE is already funded (a stake
 * refilled by a reload is not a stake). A table has no global approval on the
 * tokens (the world's is the deploy's), so the beneficiary first gives it one
 * ordinary allowance for what the unstaked seats need, skipped when the
 * allowance covers it. Nobody is staked in the world's `Stratagems`. Exported
 * for the world test.
 */
export async function stakeForEveryoneAtTheTable(params: {
	env: EmbeddedWorld['env'];
	/** The table's address. */
	table: `0x${string}`;
	player: `0x${string}`;
	humans?: readonly `0x${string}`[];
	seats: Table;
}): Promise<void> {
	const env = params.env as unknown as {
		get: (name: string) => {address: `0x${string}`; abi: unknown};
		namedAccounts: Record<string, `0x${string}`>;
		read: (deployment: never, args: unknown) => Promise<unknown>;
		execute: (deployment: never, args: unknown) => Promise<unknown>;
	};
	const atTable = {
		address: params.table,
		abi: env.get('StratagemsTableImplementation').abi,
	};
	const tokens = env.get('TestTokens');
	const payer = env.namedAccounts.tokensBeneficiary;
	const [stake] = (await env.read(atTable as never, {
		functionName: 'getTableOptions',
	})) as readonly [bigint, number, number];

	// THE WALK FINDS WHO HAS NO STAKE AT THE TABLE YET; they are staked after
	// it, together, behind one allowance.
	const unstaked: `0x${string}`[] = [];
	await stakeEverySeat({
		table: params.seats,
		you: params.player,
		...(params.humans ? {humans: params.humans} : {}),
		stake: async ({player}) => {
			const held = (await env.read(atTable as never, {
				functionName: 'getReserve',
				args: [BigInt(player)],
			})) as bigint;
			if (held === 0n) unstaked.push(player);
		},
	});
	if (unstaked.length === 0) return;

	const needed = stake * BigInt(unstaked.length);
	const allowed = (await env.read(tokens as never, {
		functionName: 'allowance',
		args: [payer, params.table],
	})) as bigint;
	if (allowed < needed) {
		await env.execute(tokens as never, {
			account: payer,
			functionName: 'approve',
			args: [params.table, needed],
		});
	}
	for (const player of unstaked) {
		await env.execute(atTable as never, {
			account: payer,
			functionName: 'addToReserve',
			args: [BigInt(player), stake],
		});
	}
}

/**
 * BOND ONE STAKE: `stakeAmount` (a whole chunk of gems, as the HUD stakes),
 * credited to the player's reserve by the tokens' beneficiary with
 * `addToReserve`, which takes the caller's gems for any player. ONLY IF THE
 * CHAIN SAYS THE PLAYER HAS NONE: provisioning runs on every boot, a restore
 * included, and a stake refillable by F5 is not a stake (the template measured
 * 10, 20, 30 on three loads before it asked).
 */
export async function stakeForOfflinePlayer(params: {
	env: EmbeddedWorld['env'];
	player: `0x${string}`;
}): Promise<void> {
	const env = params.env as unknown as {
		get: (name: string) => never;
		namedAccounts: Record<string, `0x${string}`>;
		read: (deployment: never, args: unknown) => Promise<unknown>;
		execute: (deployment: never, args: unknown) => Promise<unknown>;
	};
	const game = env.get('Stratagems');
	const held = (await env.read(game, {
		functionName: 'getReserve',
		args: [BigInt(params.player)],
	})) as bigint;
	if (held > 0n) return;
	await env.execute(game, {
		account: env.namedAccounts.tokensBeneficiary,
		functionName: 'addToReserve',
		args: [BigInt(params.player), await offlineStakeAmount(env, game)],
	});
}

/** One chunk of gems, read off the game as the client reads it (`stakeAmount`). */
async function offlineStakeAmount(
	env: {read: (deployment: never, args: unknown) => Promise<unknown>},
	game: never,
): Promise<bigint> {
	const gameConfig = (await env.read(game, {functionName: 'getConfig'})) as {
		numTokensPerGems: bigint;
		actionsPerReveal: bigint;
	};
	return gameConfig.numTokensPerGems * gameConfig.actionsPerReveal;
}

/** Who an address plays as: stratagems is an address game, so the account, widened. */
export function offlineIdentityOf(player: `0x${string}`): bigint {
	return BigInt(player);
}

/** The seats the world plays, with the identity each of their keys plays as, and their level. */
export function playedByTheWorld(table: Table): readonly OfflinePlayer[] {
	return seatsPlayedByTheWorld(table).map((seat) => ({
		privateKey: seat.privateKey,
		address: seat.address,
		identity: offlineIdentityOf(seat.address),
		...(seat.level !== undefined ? {level: seat.level} : {}),
	}));
}

/**
 * HOW THE WORLD'S SEATS DECIDE, when one of them plays at a level other than
 * `random` (step A2, A2-6 and A2-7): stratagems' strategy over the world's own
 * provider, the board read AS STORED (`getStoredCells`), scored by
 * `StratagemsSimulation`'s bytecode in a sandbox of the seats' own (not the
 * player's preview sandbox, which is the game context's and rebuilt with it),
 * and the store their decided turns are kept in. Undefined when every seat
 * plays `random`, so such a world builds no sandbox and stores nothing.
 *
 * EXPORTED for the world test, which builds the seats exactly as this does.
 * Handed the provider and nothing of the page (PA6).
 */
export function playedSeatDecider(
	world: Pick<EmbeddedWorld, 'provider' | 'deployments'>,
	played: readonly OfflinePlayer[],
	options: {
		storage?: Pick<Storage, 'getItem' | 'setItem'>;
		onDecided?: (measure: DecisionMeasure) => void;
		/** A table's board: the seats' candidates on it only (OT2-4c). */
		board?: BoardBounds;
	} = {},
) {
	if (played.every((seat) => (seat.level ?? RANDOM_LEVEL) === RANDOM_LEVEL)) {
		return undefined;
	}
	const records = world.deployments.get();
	const game = records.contracts.Stratagems;
	const simulationRecord = records.contracts.StratagemsSimulation;
	const sandbox = createBytecodeSandbox({
		provider: world.provider as never,
		contracts: {simulation: {address: simulationRecord.address}},
	});
	const publicClient = createPublicClient({
		chain: {
			id: records.chain.id,
			name: records.chain.name,
			nativeCurrency: records.chain.nativeCurrency,
			rpcUrls: {default: {http: [] as string[]}},
		},
		transport: custom(world.provider as never),
	});
	const call = (functionName: 'resolveMoves' | 'poke', args: unknown[]) =>
		sandbox.call({
			contract: 'simulation',
			abi: simulationRecord.abi,
			functionName: functionName as never,
			args: args as never,
		}) as unknown as Promise<{
			cells: readonly StoredCell[];
			payouts: readonly {to: `0x${string}`; amount: bigint}[];
			cost: bigint;
		}>;
	const simulator: StratagemsSimulator = {
		resolveMoves: (board, player, cycle, moves) =>
			call('resolveMoves', [[...board], player, cycle, [...moves]]),
		poke: (board, cycle, positions) =>
			call('poke', [[...board], cycle, [...positions]]),
	};
	const config = resolveStratagemsConfig(records as never);
	const strategy = createStratagemsStrategy({
		readBoard: async (positions) =>
			(await publicClient.readContract({
				address: game.address,
				abi: game.abi,
				functionName: 'getStoredCells',
				args: [[...positions]],
			} as never)) as readonly StoredCell[],
		simulator,
		config: {
			maxLife: config.maxLife,
			numTokensPerGems: config.numTokensPerGems,
		},
		colorOf: defaultColorOf,
		onDecided: options.onDecided,
		...(options.board ? {board: options.board} : {}),
	});
	const turns = createPlayedTurnStore({
		storage: options.storage ?? localStorage,
		key: PLAYED_TURNS_STORAGE_KEY,
		chainId: records.chain.id,
		contract: game.address,
		format: STRATAGEMS_STORAGE,
	});
	return {strategy, turns, sandbox};
}

/** Stop announcing the offline wallet. Not a teardown of the world. */
export function stopAnnouncingOfflineWallet(): void {
	wallet.stop();
}

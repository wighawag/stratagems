import {get, writable, type Readable} from 'svelte/store';
import {config, extensions} from 'stratagems-contracts/rocketh/config.js';
import deployTestTokens from 'stratagems-contracts/deploy/001_deploy_test_tokens.js';
import deployDistributor from 'stratagems-contracts/deploy/002_deploy_test_tokens_distributor.js';
import deployGems from 'stratagems-contracts/deploy/010_deploy_gems.js';
import deployGenerator from 'stratagems-contracts/deploy/011_deploy_gems_generator.js';
import deployGame from 'stratagems-contracts/deploy/020_deploy_game.js';
import {
	createEmbeddedWorld,
	expectedContractNames,
	restoreIsCoherent,
	type EmbeddedWorld,
} from '$lib/embedded';
import {mintChainId, rememberChainId} from '$lib/embedded/chain-id';
import {startEmbeddedNode} from '$lib/embedded/node';
import {
	announceEmbeddedWallet,
	type EmbeddedWallet,
} from '$lib/embedded/wallet';
import {createIndexedDBPersistence} from 'webevm';
import {createIndexedDBDeploymentStore} from '@rocketh/web';
import {isTableContract} from '$lib/stratagems/table';
import {createContext} from '$lib/context/index';
import type {Context} from '$lib/context/types';
import {createOfflinePlayers, type OfflinePlayer} from '$lib/offline-players';
import {createPublicClient, custom} from 'viem';
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
import {pokeWhenTheHumanActs} from '$lib/game/core/played';
import {
	MOST_SEATS,
	humansAtThisDevice,
	localRevealerKey,
	seatsPlayedByTheWorld,
	type Table,
} from '$lib/game/lobby/seats';
import {createLocalRevealer} from '$lib/game/core/local-revealer';
import {
	createHotseat,
	createHotseatChainReader,
	showHotseat,
	signInAs,
	signedInAs,
	type HotseatHuman,
} from '$lib/game/lobby/hotseat';
import {authoriseTheBrowsersKey} from '$lib/game/acquire';
import {resolveStratagemsConfig} from '$lib/stratagems/game-config';
import {deleteWorldIndex} from '$lib/indexer';
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
 * Which world's index this browser holds, so that the index of a world the
 * lobby forgot is deleted when the next one starts. Its own key, because the
 * lobby, byte-identical across games, knows nothing of an index.
 */
const INDEXED_CHAIN_ID_STORAGE_KEY = 'offline-world:indexed-chain-id';
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
	/**
	 * What must exist afterwards: everything the app was built against except
	 * the tables (`021_deploy_tables.ts` is not among the scripts above, since
	 * an in-tab chain has nobody to invite: step L2's PL2-3).
	 */
	expectedContracts: expectedContractNames().filter(
		(name) => !isTableContract(name),
	),
} as const;

export type OfflineWorldStatus =
	| {step: 'Idle'}
	| {step: 'Booting'; what: string}
	| {
			step: 'Ready';
			world: EmbeddedWorld;
			context: {context: Context; start: () => () => void};
	  }
	| {step: 'Failed'; error: string};

const status = writable<OfflineWorldStatus>({step: 'Idle'});

/** What the page renders. */
export const offlineWorld: Readable<OfflineWorldStatus> = {
	subscribe: status.subscribe,
};

/**
 * APP-SCOPED AND LAZY: nothing happens at import time (the app prerenders), and
 * a world is STATE, so it outlives any route that shows it.
 */
let pending: Promise<OfflineWorldStatus> | undefined;

export function startOfflineWorld(params: {
	/** Everyone this world will wait for, chosen at the lobby. */
	table: Table;
}): Promise<OfflineWorldStatus> {
	if (!pending) {
		pending = buildOfflineWorld(params.table).catch((err) => {
			pending = undefined;
			const failure: OfflineWorldStatus = {
				step: 'Failed',
				error: err instanceof Error ? err.message : String(err),
			};
			status.set(failure);
			return failure;
		});
	}
	return pending;
}

/**
 * Delete the index of the world this browser indexed before, when it is not
 * the one starting now: the lobby forgot it, or its restore was incoherent and
 * a new id was minted. Best-effort and not awaited (a database a stopping
 * worker still holds blocks its deletion until it lets go).
 */
function forgetPreviousWorldIndex(chainId: number): void {
	const previous = Number(localStorage.getItem(INDEXED_CHAIN_ID_STORAGE_KEY));
	if (previous && previous !== chainId) {
		void deleteWorldIndex(INDEXER_PREFIX, previous).catch((err) =>
			console.warn('could not delete a forgotten world\u2019s index', err),
		);
	}
	localStorage.setItem(INDEXED_CHAIN_ID_STORAGE_KEY, String(chainId));
}

async function buildOfflineWorld(table: Table): Promise<OfflineWorldStatus> {
	// Minted once and remembered: it keys everything the player keeps (the
	// operations ledger, the submission storage, the world's index).
	const chainId = rememberChainId({
		storage: localStorage,
		key: CHAIN_ID_STORAGE_KEY,
	});

	const world = await openWorld(chainId, table);
	forgetPreviousWorldIndex(world.deployments.get().chain.id);
	const humans = humansAtThisDevice(table);
	const hotseatHere = humans.length > 1;

	// WHO REVEALS FOR THE PEOPLE AT THIS DEVICE, in a hotseat world: the
	// framework's local revealer, with its own funded key, handed each turn at
	// its commit through the scheduler seam, so nobody takes the device back to
	// reveal (the template's world, H2-5). One person needs none.
	let pokeAdvance = () => {};
	const revealer = hotseatHere
		? createLocalRevealer({
				provider: world.provider as never,
				chain: worldChain(world),
				privateKey: localRevealerKey().privateKey,
				contract: gameContract(world),
				onActed: () => pokeAdvance(),
			})
		: undefined;

	status.set({step: 'Booting', what: 'connecting'});

	// SYNCHRONOUS, AND AFTER THE WORLD: the context reads the deployment while
	// constructing (the template's argument).
	const context = createContext({
		establishConnection: world.establishConnection,
		...(revealer ? {scheduler: revealer.scheduler} : {}),
	});
	pokeAdvance = () => void context.context.game.cycleAdvance.check();

	if (typeof window !== 'undefined') {
		try {
			(globalThis as unknown as Record<string, unknown>).offlineWorld = {
				world,
				context: context.context,
			};
		} catch {
			// A console convenience is never worth failing a boot for.
		}
	}

	// IT CONNECTS ITSELF: the world brought its one wallet, which signs without
	// asking, so a "Connect" button would be a question with one answer. Not
	// fatal: the game's setup gate says what is missing.
	try {
		await connectOfflinePlayer(context.context.connection);
	} catch (err) {
		console.error('the offline world could not connect its own wallet', err);
	}

	// AND AUTHORISES THE KEY THIS BROWSER PLAYS WITH, which exists only after the
	// signature above. Not fatal: the setup gate comes back with the button.
	status.set({step: 'Booting', what: "authorising this browser's key"});
	const wallet = announcedWallet;
	const seated: HotseatHuman[] = [];
	if (hotseatHere && wallet) {
		// EVERY PERSON HERE, ONE AFTER ANOTHER, ending on the first: each signed in
		// (the world asks for the signature, as above), their browser key
		// authorised and funded now rather than at their first handover, so no
		// turn opens on a transaction. The template's world's loop, with
		// stratagems' funding in it; its home is `$lib/game/lobby/hotseat`, where
		// it moves when a third game takes hotseat (H2-1).
		for (const human of humans) {
			const address = wallet.accounts[human.account];
			const label = `Player ${human.account + 1}`;
			seated.push({address, player: offlineIdentityOf(address), label});
			status.set({step: 'Booting', what: `authorising ${label}'s key`});
			try {
				await signInAs({
					connection: context.context.connection,
					select: wallet.select,
					address,
				});
				await authoriseWhenReady(context.context);
				await fundTheBrowsersKey(world, context.context);
			} catch (err) {
				console.error(
					`the offline world could not authorise ${label}'s key`,
					err,
				);
			}
		}
		try {
			await signInAs({
				connection: context.context.connection,
				select: wallet.select,
				address: seated[0].address,
			});
		} catch (err) {
			console.error('the offline world could not sign in as Player 1', err);
		}
	} else {
		try {
			await authoriseTheBrowsersKey(context.context);
		} catch (err) {
			console.error(
				"the offline world could not authorise this browser's key",
				err,
			);
		}
		await fundTheBrowsersKey(world, context.context);
	}

	// THE HANDOVER, when there are several people here: whose turn it is, read
	// from the chain, and the screen that covers the game while the device
	// changes hands (`$lib/game/lobby/hotseat`).
	const hotseat =
		hotseatHere && wallet && revealer
			? createHotseat({
					humans: seated,
					switchTo: (address) =>
						signInAs({
							connection: context.context.connection,
							select: wallet.select,
							address,
						}),
					read: createHotseatChainReader({
						provider: world.provider as never,
						chain: worldChain(world),
						contract: gameContract(world),
						players: seated.map((human) => human.player),
					}),
					revealer,
					submission: context.context.game.submission,
					signedIn: signedInAs(context.context.connection),
					accountData: context.context.accountData,
				})
			: undefined;

	// THE OTHER PLAYERS, started with the board and stopped with it.
	const played = playedByTheWorld(table);
	const decider = playedSeatDecider(world, played);
	const players = createOfflinePlayers({
		provider: world.provider,
		deployments: world.deployments,
		config: resolveStratagemsConfig(world.deployments.get() as never),
		players: played,
		// A played commit can complete unanimity just as the human's can.
		onActed: () => void context.context.game.cycleAdvance.check(),
		...(decider ? {strategy: decider.strategy, turns: decider.turns} : {}),
	});

	const ready: OfflineWorldStatus = {
		step: 'Ready',
		world,
		context: {
			context: context.context,
			start: () => {
				const stopContext = context.start();
				const stopPlayers = players.start();
				const stopPoke = pokeWhenTheHumanActs({
					loop: players,
					submission: context.context.game.submission,
				});
				const stopRevealer = revealer?.start() ?? (() => {});
				const stopHotseat = hotseat?.start() ?? (() => {});
				return () => {
					stopHotseat();
					stopRevealer();
					stopPoke();
					stopPlayers();
					// The seats' sandbox stops with the board; a later decision starts
					// it again.
					decider?.sandbox.dispose();
					stopContext();
				};
			},
		},
	};
	showHotseat(hotseat);
	status.set(ready);
	return ready;
}

/**
 * GIVE THE SIGNED-IN PERSON'S BROWSER KEY PLAY MONEY, as every seat
 * (reveal-or-die's finding, measured in bomber-world): offline the key also
 * pushes the manual cycle, twice a cycle, which the authorisation's one online
 * top-up does not cover. Gas is free here, so this is set on every boot, for
 * every person. Not fatal.
 */
async function fundTheBrowsersKey(
	world: EmbeddedWorld,
	context: Context,
): Promise<void> {
	try {
		const signer = get(context.signerExecutor);
		if (signer.status === 'ready') {
			await world.provider.request({
				method: 'evm_setBalance',
				params: [signer.address, `0x${PLAY_MONEY.toString(16)}`],
			} as never);
		}
	} catch (err) {
		console.error("the offline world could not fund this browser's key", err);
	}
}

/**
 * Authorise the signed-in person's browser key, once the context has caught up
 * with the account switch: right after one, the account's executor can still
 * be getting ready, which `authoriseTheBrowsersKey` answers with a refusal
 * rather than a wait (the template's world).
 */
async function authoriseWhenReady(context: Context): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt++) {
		const outcome = await authoriseTheBrowsersKey(context);
		if (outcome.step !== 'Refused') return;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("the browser's key could not be authorised");
}

/** The world's chain as viem wants it, for the clients the world's own loops build. */
function worldChain(world: EmbeddedWorld) {
	const records = world.deployments.get();
	return {
		id: records.chain.id,
		name: records.chain.name,
		nativeCurrency: records.chain.nativeCurrency,
		rpcUrls: {default: {http: [] as string[]}},
	};
}

/** Stratagems' game contract, which the revealer and the handover read. */
function gameContract(world: EmbeddedWorld) {
	const game = world.deployments.get().contracts.Stratagems;
	return {address: game.address, abi: game.abi};
}

/**
 * Boot (or restore) the world for one chain id: PERSISTED, so a reload restores
 * the chain and skips the deploy. The restore is checked BEFORE anything is
 * deployed (records that outlive their chain make the deploy throw), and an
 * incoherent one starts a new world under a new id.
 */
async function openWorld(
	chainId: number,
	table: Table,
): Promise<EmbeddedWorld> {
	status.set({step: 'Booting', what: 'starting a chain in this tab'});

	const deploymentStore = await createIndexedDBDeploymentStore({
		db: `offline-world-deployments:${chainId}`,
	});

	const probe = await startEmbeddedNode({
		chainId,
		persistence: createIndexedDBPersistence({
			db: `offline-world-chain:${chainId}`,
		}),
	});
	const coherent = await restoreIsCoherent({
		provider: probe.provider,
		vfs: deploymentStore.vfs,
	});
	await probe.dispose();
	if (!coherent) {
		status.set({step: 'Booting', what: 'starting a new world'});
		const fresh = mintChainId();
		localStorage.setItem(CHAIN_ID_STORAGE_KEY, String(fresh));
		return openWorld(fresh, table);
	}

	return createEmbeddedWorld({
		chainId,
		chain: {
			name: 'Offline',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			properties: {
				// THE LOCAL CHAIN'S OWN PROPERTIES (step S): `expectedWorstGasPrice`
				// sizes the stake's stipend and `creditsGasMultiplier` shows the key's
				// gas as moves left, so they are read from the deploy config, not
				// typed again.
				...config.chains[31337].properties,
				// A block exists only where a transaction happened; one second is the
				// honest floor for anything that polls, and the manual policy reads no
				// deadline.
				averageBlockTimeMs: 1000,
				// ZERO CONFIRMATIONS: the newest transaction is always in the latest
				// block of an automined chain, and nothing reorgs a chain in one tab.
				finality: 0,
			},
		},
		rocketh: {config: config as never, extensions},
		environment: OFFLINE_DEPLOYMENT.environment,
		scripts: [...OFFLINE_DEPLOYMENT.scripts],
		accounts: {...OFFLINE_DEPLOYMENT.accounts},
		initialBalances: {...OFFLINE_DEPLOYMENT.initialBalances},
		expectedContracts: [...OFFLINE_DEPLOYMENT.expectedContracts],
		persistence: createIndexedDBPersistence({
			db: `offline-world-chain:${chainId}`,
		}),
		deploymentStore,
		provision: (params) => provisionOfflinePlayer({...params, chainId, table}),
	});
}

let announced: (() => void) | undefined;
/** The wallet provisioning announced: the world switches its accounts in hotseat. */
let announcedWallet: EmbeddedWallet | undefined;

/**
 * WHAT AN OFFLINE PLAYER OF STRATAGEMS IS GIVEN: a wallet (the world's own),
 * gas for every seat (on every boot: gas is a number in a tab), and a stake for
 * every seat (only when it has none: a stake is what is at risk). The human's
 * browser key is not known yet here; the world authorises it after sign-in.
 */
async function provisionOfflinePlayer(params: {
	env: EmbeddedWorld['env'];
	node: {provider: {request: (args: never) => Promise<unknown>}};
	chainId: number;
	table: Table;
}) {
	const {env, node, table} = params;

	status.set({step: 'Booting', what: 'handing the player a wallet'});
	const humans = humansAtThisDevice(table);
	const wallet = await announceEmbeddedWallet({
		provider: node.provider as never,
		chainId: params.chainId,
		accounts: humans.length,
	});
	announced = wallet.cleanup;
	announcedWallet = wallet;

	for (const account of [
		...wallet.accounts,
		...seatsPlayedByTheWorld(table).map((seat) => seat.address),
		// the revealer's own key, which only a hotseat world uses
		...(humans.length > 1 ? [localRevealerKey().address] : []),
	]) {
		await node.provider.request({
			method: 'evm_setBalance',
			params: [account, `0x${PLAY_MONEY.toString(16)}`],
		} as never);
	}

	status.set({step: 'Booting', what: 'staking for everyone at the table'});
	await stakeForEveryoneInTheWorld({
		env,
		player: wallet.accounts[0],
		humans: wallet.accounts,
		table,
	});

	return {wallets: [wallet.handle]};
}

/**
 * GIVE EVERY SEAT AT THE TABLE SOMETHING TO LOSE: a walk of the table, so the
 * day a seat holds a second human it is staked for by this same line. Exported
 * because it is the half of provisioning that runs in node, and the world test
 * calls exactly this (and counts the waited-for members off `getAttendance`).
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
	for (const seat of params.table) {
		// A remote human stakes for themselves, at a table online; an offline
		// world has none.
		if (seat.occupant.kind === 'remote-human') continue;
		const player =
			seat.occupant.kind === 'you'
				? params.player
				: seat.occupant.kind === 'local-human'
					? params.humans?.[seat.occupant.account]
					: seat.occupant.address;
		if (!player) {
			throw new Error('a person at this device has no account to stake for');
		}
		await stakeForOfflinePlayer({env: params.env, player});
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

/**
 * CONNECT, THEN SIGN IN: this app targets `SignedIn`, and the step after the
 * wallet is a signature nobody is there to ask for, so the world asks its own
 * auto-approving wallet (the template's argument, at length).
 */
async function connectOfflinePlayer(connection: Context['connection']) {
	await connection.ensureConnected('WalletConnected');
	if (connection.targetStep === 'SignedIn') {
		await connection.requestSignature();
	}
}

/** Stop announcing the offline wallet. Not a teardown of the world. */
export function stopAnnouncingOfflineWallet(): void {
	announced?.();
	announced = undefined;
}

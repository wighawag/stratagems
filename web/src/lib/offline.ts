import {get, writable, type Readable} from 'svelte/store';
import {config, extensions} from 'stratagems-contracts/rocketh/config.js';
import deployTestTokens from 'stratagems-contracts/deploy/001_deploy_test_tokens.js';
import deployDistributor from 'stratagems-contracts/deploy/002_deploy_test_tokens_distributor.js';
import deployGems from 'stratagems-contracts/deploy/010_deploy_gems.js';
import deployGenerator from 'stratagems-contracts/deploy/011_deploy_gems_generator.js';
import deployGame from 'stratagems-contracts/deploy/020_deploy_game.js';
import {
	createEmbeddedWorld,
	restoreIsCoherent,
	type EmbeddedWorld,
} from '$lib/embedded';
import {mintChainId, rememberChainId} from '$lib/embedded/chain-id';
import {startEmbeddedNode} from '$lib/embedded/node';
import {announceEmbeddedWallet} from '$lib/embedded/wallet';
import {createIndexedDBPersistence} from 'webevm';
import {createIndexedDBDeploymentStore} from '@rocketh/web';
import {createContext} from '$lib/context/index';
import type {Context} from '$lib/context/types';
import {createOfflinePlayers, type OfflinePlayer} from '$lib/offline-players';
import {pokeWhenTheHumanActs} from '$lib/game/core/played';
import {seatsPlayedByTheWorld, type Table} from '$lib/game/lobby/seats';
import {authoriseTheBrowsersKey} from '$lib/game/acquire';
import {resolveStratagemsConfig} from '$lib/stratagems/game-config';
import {deleteWorldIndex} from '$lib/stratagems/board/worker-choice';

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
 *
 * THE WORLD'S BOARD IS INDEXED IN THIS TAB, by its own worker and into a
 * database of its own kept across reloads (`board/worker-choice.ts`, P8). Its
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
		void deleteWorldIndex(previous).catch((err) =>
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

	status.set({step: 'Booting', what: 'connecting'});

	// SYNCHRONOUS, AND AFTER THE WORLD: the context reads the deployment while
	// constructing (the template's argument).
	const context = createContext({
		establishConnection: world.establishConnection,
	});

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
	try {
		await authoriseTheBrowsersKey(context.context);
	} catch (err) {
		console.error(
			"the offline world could not authorise this browser's key",
			err,
		);
	}

	// AND GIVES THAT KEY PLAY MONEY, as every seat (reveal-or-die's finding,
	// measured in bomber-world): offline the key also pushes the manual cycle,
	// twice a cycle, which the authorisation's one online top-up does not cover.
	// Gas is free here, so this is set on every boot.
	try {
		const signer = get(context.context.signerExecutor);
		if (signer.status === 'ready') {
			await world.provider.request({
				method: 'evm_setBalance',
				params: [signer.address, `0x${PLAY_MONEY.toString(16)}`],
			} as never);
		}
	} catch (err) {
		console.error("the offline world could not fund this browser's key", err);
	}

	// THE OTHER PLAYERS, started with the board and stopped with it.
	const players = createOfflinePlayers({
		provider: world.provider,
		deployments: world.deployments,
		config: resolveStratagemsConfig(world.deployments.get() as never),
		players: playedByTheWorld(table),
		// A played commit can complete unanimity just as the human's can.
		onActed: () => void context.context.game.cycleAdvance.check(),
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
				return () => {
					stopPoke();
					stopPlayers();
					stopContext();
				};
			},
		},
	};
	status.set(ready);
	return ready;
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
		persistence: createIndexedDBPersistence({
			db: `offline-world-chain:${chainId}`,
		}),
		deploymentStore,
		provision: (params) => provisionOfflinePlayer({...params, chainId, table}),
	});
}

let announced: (() => void) | undefined;

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
	const wallet = await announceEmbeddedWallet({
		provider: node.provider as never,
		chainId: params.chainId,
	});
	announced = wallet.cleanup;

	for (const account of [
		...wallet.accounts,
		...seatsPlayedByTheWorld(table).map((seat) => seat.address),
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
	table: Table;
}): Promise<void> {
	for (const seat of params.table) {
		const player =
			seat.occupant.kind === 'you' ? params.player : seat.occupant.address;
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

/** The seats the world plays, with the identity each of their keys plays as. */
export function playedByTheWorld(table: Table): readonly OfflinePlayer[] {
	return seatsPlayedByTheWorld(table).map((seat) => ({
		privateKey: seat.privateKey,
		address: seat.address,
		identity: offlineIdentityOf(seat.address),
	}));
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

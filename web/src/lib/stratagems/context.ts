/**
 * STRATAGEMS, COMPOSED ON THE TEMPLATE: the game half of the app context.
 *
 * The commit-reveal skeleton (`$lib/game/core/commit-reveal-game`) owns the
 * wiring (the clock, the cycle's phases and its advance, the submission and its
 * secret, recovery, the setup gate, the handover between the plan and the board,
 * the camera); the base's client (`$lib/game/core/commit-reveal/`) owns the calls
 * every game on the base makes. This file hands them stratagems' parts: its
 * move, its board (the etherfold indexer, not a poller), its rules for what a
 * click may plan, its view (the planned moves run by the contract's own code
 * in the bytecode sandbox, `./preview.ts`), its stake (gems in the reserve) and its board, drawn with pixi. It is the
 * reference game's `placement/context.ts` with stratagems' parts in it.
 *
 * Constructed synchronously and off-browser, like the core half: nothing here
 * starts IO, which belongs to `start()` and to the board's first subscriber.
 */
import {
	derived,
	get,
	writable,
	type Readable,
	type Writable,
} from 'svelte/store';
// dynamic, not static: the framework's own tests mock `$env/static/public` with
// the framework's names only (test/lib/context/fatal.test.ts)
import {env} from '$env/dynamic/public';
import type {EIP1193Provider} from 'viem';
import type {CoreServices} from '$lib/context/core';
import {url} from '$lib/kit/paths';
import type {SignerGrant} from '$lib/ui/delegation/grant';
import {
	createActiveIdentity,
	onchainIdentity,
	type ActiveIdentityStore,
	type GameIdentity,
} from '$lib/game/identity';
import {
	createCommitRevealGame,
	type CommitRevealGame,
	type SetupNeeded as FrameworkSetupNeeded,
} from '$lib/game/core/commit-reveal-game';
import type {OnchainStateStore} from '$lib/onchain/state';
import type {ViewStateStore} from '$lib/view';
import type {CameraControl, CameraWatcher} from '$lib/game/render/camera';
import type {CanvasEventEmitter} from '$lib/game/render/events';
import type {GameRenderer} from '$lib/game/core/seams';
import {createCycleReader} from '$lib/game/core/commit-reveal/cycle';
import {
	createAttendanceReader,
	createCycleAdvancer,
} from '$lib/game/core/commit-reveal/advance';
import {
	createReserve,
	type ReserveStore,
} from '$lib/game/core/commit-reveal/reserve';
import {
	blocksCommitting,
	createMissedReveal,
	type MissedRevealStore,
} from '$lib/game/core/commit-reveal/missed-reveal';
import {SignerOutOfFundsError} from '$lib/game/core/commit-reveal/errors';
import {isEmbeddedChainId} from '$lib/embedded/chain-id';
import {resolveURLForThisPage} from '$lib/core/env/same-host';
import {xyToBigIntID} from 'stratagems-common';

// ---------------------------------------------------------------------------
// The `with/fuzd` layer: the reveal sent by fuzd, so it happens without this
// tab. A dependency composed here and nowhere else (R1), absent when not
// configured (R2). See `$lib/fuzd`.
// ---------------------------------------------------------------------------
import {
	createFuzdScheduler,
	createScheduledReveal,
	fuzdSettings,
	revealModeFor,
	revealOnScheduleFailure,
	scheduledTurn,
	type FuzdExtensions,
	type ScheduledReveal,
} from '$lib/fuzd';

// ---------------------------------------------------------------------------
// The game itself.
// ---------------------------------------------------------------------------
import {
	costOfMoves,
	resolveStratagemsConfig,
	type StratagemsConfig,
} from './game-config';
import {
	buildMovesCommitment,
	createStratagemsCommitReveal,
	gameContract,
	MOVE_ENCODING,
	type Move,
} from './moves';
import {createSubmissionStorage} from './submission-storage';
import {storedTurnsFor} from '$lib/game/core/commit-reveal/storage';
import {createIndexedBoard, type BoardState} from './board/indexed-board';
import {createPlanning, type PlanningStore} from './planning';
import {createFaction, type FactionStore} from './faction';
import {createWalletSend} from './wallet';
import {createWinnings, type WinningsStore} from './winnings';
import {createLeaderboard, type LeaderboardRow} from './leaderboard';
import {createTestGems, type TestGemsStore} from './test-gems';
import {createSyncing, type SyncingModel} from './syncing';
import {holdResolvingCycle, holdPlanUntilBoardReleases} from './hold';
import {createBoardMerge, type BoardView} from './view';
import {createBytecodeSandbox} from '$lib/game/simulation';
import {createMovesPreview, withPreview, type SimulateMoves} from './preview';
import {createStakeAcquisition, stakeNeeded} from './stake';
import {
	createBoardRenderer,
	createFocus,
	type FocusStore,
	type GameSurface,
} from './render';

/** What stands between the player and their first move. */
export type SetupNeeded = FrameworkSetupNeeded<{step: 'stake'}>;

/**
 * WHAT THIS APP'S BROWSER KEY IS FOR, in this app's words: the verb phrase the
 * template's consent sentences are built around (`ui/delegation/grant.ts`).
 */
export const SIGNER_GRANT: SignerGrant = {action: 'play your moves'};

/** Stratagems' types, as the commit-reveal skeleton is told them. */
export type StratagemsGame = {
	identity: GameIdentity;
	action: Move;
	board: BoardState;
	view: BoardView;
	planning: PlanningStore;
	missedReveal: MissedRevealStore;
	stake: {step: 'stake'};
	surface: GameSurface;
	/** What the layers keep with a turn: `with/fuzd`'s schedule. */
	extensions: FuzdExtensions;
};

export type Game = CommitRevealGame<StratagemsGame>['game'] & {
	config: StratagemsConfig;
	/** WHO IS PLAYING: what the submission, the stake and the storage are keyed by. */
	activeIdentity: ActiveIdentityStore;
	/** The gems at stake. */
	reserve: ReserveStore;
	/** What the planned turn would put on the board, at one gem a placement. */
	cost: Readable<bigint>;
	setup: Readable<SetupNeeded | undefined>;
	/** The colour the player's placements take. */
	faction: FactionStore;
	/** The shares of dead cells owed to the player, and their collection. */
	winnings: WinningsStore;
	leaderboard: Readable<LeaderboardRow[]>;
	/** Free gems from the deployment's distributor, where it has one. */
	testGems: TestGemsStore;
	/** The gem whose owner the board lights and the card describes. */
	focus: FocusStore;
	/** The faction wash under each faction's living cells, a toggle (off by default). */
	factionWash: Writable<boolean>;
	/** What the indexer is doing while the board is behind the chain. */
	syncing: Readable<SyncingModel>;
	/**
	 * Whether the committed turn's reveal is handed to fuzd, and what fuzd says
	 * about it in the reveal phase. Undefined without a committed turn, and
	 * always without a scheduler (R2).
	 */
	revealSchedule: Readable<ScheduledReveal | undefined>;
};

export type Render = {
	camera: CameraWatcher;
	cameraControl: CameraControl;
	gameRenderer: GameRenderer<GameSurface>;
	eventEmitter: CanvasEventEmitter;
};

export type GameContext = {
	onchainState: OnchainStateStore<BoardState>;
	viewState: ViewStateStore<BoardView>;
	game: Game;
	render: Render;
	/** Begin the game's own IO. Returns the teardown. */
	start(): () => void;
};

export function createGameContext(core: CoreServices): GameContext {
	// WHO PLAYS: the account, as in every address game on the template; the local
	// signer acts for it through `StratagemsDelegation`.
	const activeIdentity = createActiveIdentity({account: core.account});
	const focus = createFocus();
	const factionWash = writable(false);

	const deployments = core.deployments.get();
	const config = resolveStratagemsConfig(deployments);
	const contract = gameContract(deployments);
	const gameAddress = deployments.contracts.Stratagems.address;

	const reserve = createReserve({
		deps: core,
		contract,
		tokenAddress: config.tokenAddress,
		onchainIdentity,
		identity: activeIdentity,
	});

	const faction = createFaction({player: activeIdentity});
	const send = createWalletSend(core);
	let indexedBoard: ReturnType<typeof createIndexedBoard> | undefined;

	// Keyed by WHO PLAYS, in the account data, so it is synced and encrypted with
	// it, and typed with the layers' extensions (`with/fuzd`'s schedule).
	const storageFor = (player: GameIdentity) =>
		createSubmissionStorage<FuzdExtensions>({
			accountData: core.accountData,
			chainId: deployments.chain.id,
			contract: gameAddress,
			player,
		});

	// WHO REVEALS (P7). With fuzd configured, fuzd sends the reveal as the phase
	// opens and this browser falls back at half of it; without it (no
	// `PUBLIC_FUZD_URI`, a chain with no `expectedWorstGasPrice`, or the offline
	// world, whose chain a service cannot reach), it reveals at once.
	const fuzd = fuzdSettings({
		uri: env.PUBLIC_FUZD_URI,
		chain: deployments.chain,
		embedded: isEmbeddedChainId(deployments.chain.id),
	});
	const fuzdEndpoint = () =>
		fuzd ? resolveURLForThisPage(fuzd.uri) : undefined;
	const scheduler = fuzd
		? createFuzdScheduler<GameIdentity>({
				schedulerEndPoint: fuzdEndpoint,
				chainId: fuzd.chainId,
				maxFeePerGasAuthorized: fuzd.maxFeePerGasAuthorized,
				expiryDelta: config.cycle.revealPhaseDuration,
				// fuzd's requests are signed with the browser key, which is what its
				// remote account is derived from: the key that commits, not the
				// account that owns.
				signerKey: () => {
					const connection = get(core.connection);
					return connection.step === 'SignedIn'
						? connection.account.signer.privateKey
						: undefined;
				},
				balanceOf: (address) => core.publicClient.getBalance({address}),
			})
		: undefined;

	// THE RULES, RUN FROM THE CONTRACT'S OWN CODE: `StratagemsSimulation`'s
	// deployed bytes, read once from whatever chain the app is on (a live one or
	// the one in the tab) and run in a sandbox of its own, so what a planned move
	// shows is what the reveal will do. Nothing is fetched or started until a
	// move is planned. See `./preview.ts`.
	const sandbox = createBytecodeSandbox({
		provider: core.publicClient,
		contracts: {
			simulation: {address: deployments.contracts.StratagemsSimulation.address},
		},
	});
	const simulate: SimulateMoves = async (board, player, cycleNumber, moves) =>
		(
			await sandbox.call({
				contract: 'simulation',
				abi: deployments.contracts.StratagemsSimulation.abi,
				functionName: 'resolveMoves',
				args: [[...board], player, cycleNumber, [...moves]],
			})
		).cells;

	const crg = createCommitRevealGame<StratagemsGame>(core, {
		identity: activeIdentity,
		contract: gameAddress,
		cycle: {
			config: config.cycle,
			readCycle: createCycleReader({publicClient: core.publicClient, contract}),
			readAttendance: createAttendanceReader({
				publicClient: core.publicClient,
				contract,
			}),
			advance: createCycleAdvancer({deps: core, contract}),
			// The base's `_advanceCycle` re-checks the policy and refuses under
			// `Timed`, stratagems' policy, with a named error.
			contractIsTheJudge: true,
		},
		actionsPerReveal: config.actionsPerReveal,
		camera: config.camera,
		// THE INDEXER, not the poller the skeleton offers.
		board: () =>
			(indexedBoard = createIndexedBoard({
				provider: core.connection.provider as unknown as EIP1193Provider,
				publicClient: core.publicClient,
				deployment: deployments as unknown as Parameters<
					typeof createIndexedBoard
				>[0]['deployment'],
				cycleConfig: config.cycle,
				player: activeIdentity,
				snapshotURI: env.PUBLIC_SNAPSHOT_URI || undefined,
				appPath: url,
			})),
		// Shown its chunks, a missed reveal costs one gem per committed move and
		// the rest of the bond comes back; without them, the whole bond.
		missedReveal: () =>
			createMissedReveal<GameIdentity, Move>({
				deps: core,
				contract,
				encoding: MOVE_ENCODING,
				onchainIdentity,
				actionsPerReveal: config.actionsPerReveal,
				penaltyFor: (count) => costOfMoves(config, count),
				identity: activeIdentity,
				committedTurn: (player, cycleNumber) =>
					storedTurnsFor(storageFor(player), cycleNumber),
				// Settled on chain: what is kept of that turn may now be pruned.
				onSettled: ({player, cycleNumber}) => {
					storageFor(player).settled(cycleNumber);
					void reserve.update();
				},
			}),
		blocksCommitting,
		adapter: ({beforeCommit}) =>
			createStratagemsCommitReveal({deps: core, config, beforeCommit}),
		buildCommitment: ({actions, secret}) =>
			buildMovesCommitment({
				actions,
				secret,
				actionsPerReveal: config.actionsPerReveal,
			}),
		storageFor,
		...(scheduler ? {scheduler} : {}),
		submission: revealModeFor(scheduler !== undefined),
		isOutOfGas: (error) => error instanceof SignerOutOfFundsError,
		stake: {
			refresh: () => reserve.update(),
			needed: derived(reserve, stakeNeeded),
			acquisition: createStakeAcquisition({config, deployments}),
			grant: SIGNER_GRANT,
		},
		// The plan the view draws carries what the planned moves will do, once
		// the sandbox has answered for exactly those moves.
		planning: ({submission, maxOpenableActions, onchainState}) => {
			const planning = createPlanning({
				submission,
				maxOpenableActions,
				onchainState,
				identity: activeIdentity,
				faction,
				maxLife: config.maxLife,
			});
			const preview = createMovesPreview({
				plan: planning.plan,
				board: {subscribe: onchainState.subscribe},
				simulate,
			});
			return {...planning, plan: withPreview(planning.plan, preview)};
		},
		hold: holdResolvingCycle,
		holdPlan: holdPlanUntilBoardReleases,
		merge: createBoardMerge(config.maxLife),
		renderer: ({viewState}) =>
			createBoardRenderer({
				viewState,
				cellSize: config.cellSize,
				maxLife: config.maxLife,
				focus,
				factionWash,
			}),
		// Cells are centred on their integer coordinate.
		click: (position, {planning}) =>
			planning.click(
				xyToBigIntID(Math.round(position.x), Math.round(position.y)),
			),
		start: () => {
			void reserve.update();
			const stop = activeIdentity.subscribe(() => void reserve.update());
			return () => {
				stop();
				sandbox.dispose();
			};
		},
	});

	// What the planned turn would bond, at one gem a placement (a removal costs
	// nothing and returns its gem; the bond is whole chunks either way).
	const cost = derived(crg.game.planning.actions, ($moves) =>
		costOfMoves(config, $moves.filter((move) => move.color !== 0).length),
	);

	if (!indexedBoard) throw new Error('the skeleton did not build the board');
	const board = indexedBoard;

	const winnings = createWinnings({
		onchainState: crg.onchainState,
		identity: activeIdentity,
		numTokensPerGems: config.numTokensPerGems,
		maxLife: config.maxLife,
		game: contract,
		send,
		onCollected: () => void board.update(),
	});
	const leaderboard = createLeaderboard({
		onchainState: crg.onchainState,
		identity: activeIdentity,
		maxLife: config.maxLife,
	});
	const testGems = createTestGems({
		deployments,
		send,
		onReceived: () => void reserve.update(),
	});
	const syncing = createSyncing(board.progress);

	// What the HUD says about the scheduled reveal, read from the record stored
	// with the turn, and fuzd's word on it in the reveal phase.
	const revealSchedule = createScheduledReveal({
		turn: scheduledTurn({
			identity: activeIdentity,
			submission: crg.game.submission,
			storageFor,
		}),
		cycleInfo: crg.game.cycleInfo,
		endpoint: fuzdEndpoint,
		// The local chain's reveal phase is seconds long.
		intervalMs: deployments.chain.id === 31337 ? 1_000 : 5_000,
	});

	return {
		onchainState: crg.onchainState,
		viewState: crg.viewState,
		game: {
			...crg.game,
			config,
			activeIdentity,
			reserve,
			cost,
			faction,
			winnings,
			leaderboard,
			testGems,
			syncing,
			revealSchedule,
			focus,
			factionWash,
		},
		render: crg.render,
		start: () => {
			const stop = crg.start();
			// fuzd says it will not reveal: this browser does, at once (P7).
			const stopFallback = scheduler
				? revealOnScheduleFailure({
						reveal: revealSchedule,
						submission: crg.game.submission,
					})
				: () => {};
			return () => {
				stopFallback();
				stop();
			};
		},
	};
}

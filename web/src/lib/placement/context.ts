/**
 * The game half of the app context.
 *
 * `createContext` used to build everything in one function. It is split so the
 * two halves can move independently: `core.ts` is jolly-roger's, merged down
 * from upstream and best left alone, while this file is the reference game
 * composed on the commit-reveal skeleton (`$lib/game/core/commit-reveal-game`).
 * The skeleton owns the WIRING (which store re-checks what, and when); this file
 * hands it the game's parts. A descendant keeps the shape and swaps the parts.
 *
 * Constructed synchronously and off-browser, like the core half: nothing here
 * starts IO, which belongs to `start()`. See ADR-0002.
 */
import {derived, get, type Readable} from 'svelte/store';
import {env} from '$env/dynamic/public';
import type {CoreServices} from '$lib/context/core';
import type {SignerGrant} from '$lib/ui/delegation/grant';
import type {ChainTimeStore} from '$lib/game/core/chain-time';
import type {CycleInfoStore, ThreePhase, TwoPhase} from '$lib/game/core/cycle';
import type {SubmissionStore} from '$lib/game/core/submission';
import type {CycleAdvanceStore} from '$lib/game/core/advance';
import {
	createActiveIdentity,
	onchainIdentity,
	type ActiveIdentityStore,
	type GameIdentity,
} from '$lib/game/identity';
import type {RecoveryStore} from '$lib/game/core/recovery';
import type {CyclePhase} from '$lib/game/core/cycle-phase';
import {
	createCommitRevealGame,
	type SavedTurn,
	type SetupNeeded as FrameworkSetupNeeded,
} from '$lib/game/core/commit-reveal-game';
import type {AcquisitionStore} from '$lib/game/acquire';
import type {CameraControl, CameraWatcher} from '$lib/game/render/camera';
import type {CanvasEventEmitter} from '$lib/game/render/events';
import type {GameRenderer} from '$lib/game/core/seams';
import type {OnchainStateStore} from '$lib/onchain/state';
import type {ViewStateStore} from '$lib/view';
import {isEmbeddedChainId} from '$lib/embedded/chain-id';
import {resolveURLForThisPage} from '$lib/core/env/same-host';

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
// The game itself. Everything below is what a descendant replaces; everything
// above is the framework it plugs into.
// ---------------------------------------------------------------------------
import {
	resolvePlacementConfig,
	type PlacementConfig,
} from '$lib/placement/config';
import {
	buildPlacementCommitment,
	createPlacementCommitReveal,
	gameContract,
	type Placement,
} from '$lib/placement/commit-reveal';
import {PLACEMENT_STORAGE} from '$lib/placement/storage';
import {
	createAccountDataSubmissionStorage,
	storedTurnsFor,
} from '$lib/game/core/commit-reveal/storage';
import {createPlanning, type PlanningStore} from '$lib/placement/planning';
import {createCycleReader} from '$lib/game/core/commit-reveal/cycle';
import {
	createAttendanceReader,
	createCycleAdvancer,
} from '$lib/game/core/commit-reveal/advance';
import {holdResolvingCycle, type HeldBoardState} from '$lib/placement/hold';
import {holdPlanUntilBoardReleases} from '$lib/placement/display-plan';
import {SignerOutOfFundsError} from '$lib/game/core/commit-reveal/errors';
import {createReserve, type ReserveStore} from '$lib/placement/reserve';
import {createStakeAcquisition} from '$lib/placement/acquisition';
import {
	blocksCommitting,
	createMissedReveal,
	type MissedRevealStore,
} from '$lib/placement/missed-reveal';
import {
	createBoardReader,
	emptyBoard,
	zonesForCamera,
	type BoardState,
} from '$lib/placement/state';
import {mergeBoardView, type BoardView} from '$lib/placement/view';
import {createPlacementPreview, withPreview} from '$lib/placement/preview';
import {createBytecodeSandbox} from '$lib/game/simulation';
import {createGameRenderer, type GameSurface} from '$lib/placement/render';
import {cellID} from '$lib/placement/cells';

export type Game = {
	config: PlacementConfig;
	/**
	 * WHO IS SIGNED IN: the authenticated account, not the key that signs.
	 *
	 * THE ACCOUNT, and it stays the account in every game built on this
	 * template. It is an address here, on `with/nft-identity`, and in
	 * reveal-or-die, which made the same call independently.
	 *
	 * Exposed because the account/signer distinction is the safety property of
	 * the whole design and is otherwise invisible from outside: the account
	 * owns, and a different key pays the gas and sends the moves.
	 *
	 * NOT what the submission is keyed by. That is `activeIdentity`, and the two
	 * hold the SAME VALUE here because the template is an address game - which is
	 * precisely why they have to be two members rather than one. A consumer asking
	 * "who am I signed in as" wants this one; a consumer asking "whose commitment
	 * is this" wants the other, and on a game whose identity is a token they are
	 * different values of different types.
	 */
	identity: Readable<`0x${string}` | undefined>;
	/**
	 * WHO IS PLAYING: what the submission, the commitment, the stake and the
	 * submission's storage key are all keyed by. See `$lib/game/identity`.
	 *
	 * Equal to `identity` here and NOT the same question. Where a game's
	 * identity is a token, the account still exists and still owns the token;
	 * this is the token.
	 */
	activeIdentity: ActiveIdentityStore;
	/** Chain-synced wall clock. NOT `clock`, which is only a UI ticker. */
	chainTime: ChainTimeStore;
	/** Which cycle we are in, and how far through its phases. */
	cycleInfo: CycleInfoStore;
	/** Player-facing phases: play / commit / reveal. */
	threePhase: Readable<ThreePhase>;
	/**
	 * The four-part model the HUD draws and the move gate reads.
	 *
	 * `threePhase` plus the one state a clock cannot see: the board is still
	 * showing a cycle that is already over. See `game/core/cycle-phase.ts`.
	 */
	phase: Readable<CyclePhase>;
	/** The same, collapsed to play / wait. */
	twoPhase: Readable<TwoPhase>;
	/** The commit-reveal submission: what is planned, committed, revealed. */
	submission: SubmissionStore<GameIdentity, Placement, FuzdExtensions>;
	/**
	 * Whether the committed turn's reveal is handed to fuzd, and what fuzd says
	 * about it in the reveal phase. Undefined without a committed turn, and
	 * always without a scheduler (R2).
	 */
	revealSchedule: Readable<ScheduledReveal | undefined>;
	/**
	 * Pushing the cycle on, which a policy with no clock needs a transaction for.
	 *
	 * Idle on an ordinary TIMED deployment, where the cycle is the clock and the
	 * contract refuses an advance outright. It is exposed anyway rather than
	 * hidden behind the policy, because what it is doing - spending the player's
	 * gas, unprompted, to keep the game moving - is something a HUD should be
	 * able to say out loud.
	 */
	cycleAdvance: CycleAdvanceStore;
	/** Clicks into planned placements. */
	planning: PlanningStore;
	/** The tokens at stake, without which nobody would have to reveal. */
	reserve: ReserveStore;
	/**
	 * Getting a stake in the first place: one transaction, which also funds the
	 * key this browser plays with. See `$lib/game/acquire`.
	 */
	acquisition: AcquisitionStore;
	/**
	 * An unrevealed commitment from a past cycle, which blocks all further play
	 * until the player acknowledges the forfeit.
	 */
	missedReveal: MissedRevealStore;
	/**
	 * A commitment the chain holds for the cycle in progress that this browser
	 * has no memory of - a cleared browser, a second device, a private window.
	 * The stake is still recoverable while the cycle lasts. See
	 * `$lib/game/core/recovery`.
	 */
	recovery: RecoveryStore<Placement>;
	/** What the planned submission will cost the player. */
	cost: Readable<bigint>;
	/**
	 * Whether the player can actually take a turn: they have an identity to play
	 * as, and a reserve to bond from.
	 *
	 * Clicks do nothing while this is false. Letting someone plan a whole turn
	 * they cannot commit is worse than not letting them start: the moves look
	 * accepted, and the failure only arrives at the commit, by which point the
	 * cycle is over.
	 */
	readyToPlay: Readable<boolean>;
	/** What is still missing before a turn can be taken, if anything. */
	setup: Readable<SetupNeeded | undefined>;
	/** Whether the saved turn has loaded, for the HUD to say while it has not. */
	savedTurn: Readable<SavedTurn>;
};

/**
 * What stands between the player and their first move, in the order it has to
 * happen: the framework's gate with this game's stake step in it.
 */
export type SetupNeeded = FrameworkSetupNeeded<{step: 'stake'}>;

export type Render = {
	camera: CameraWatcher;
	cameraControl: CameraControl;
	/**
	 * `GameSurface` is the game's own choice of rendering library, named in one
	 * place (`$lib/placement/render`). Nothing in the framework mentions pixi,
	 * which is what lets a descendant swap the renderer without touching the
	 * context.
	 */
	gameRenderer: GameRenderer<GameSurface>;
	eventEmitter: CanvasEventEmitter;
};

export type GameContext = {
	onchainState: OnchainStateStore<BoardState & {cycleNumber: number}>;
	viewState: ViewStateStore<BoardView>;
	game: Game;
	render: Render;
	/** Begin the game's own IO. Returns the teardown. */
	start(): () => void;
};

/**
 * What this game needs at stake before a first move: a reserve to bond from.
 *
 * The game's step of the setup gate; the framework's `setupNeeded` puts it
 * between signing in and authorising. `Unloaded` is not "no stake": treating
 * an unfinished read as an empty one would put the gate over a playable board
 * on every load until it lands.
 */
export function stakeNeeded(reserve: {
	step: string;
	amount?: bigint;
}): {step: 'stake'} | undefined {
	return reserve.step === 'Loaded' && reserve.amount === 0n
		? {step: 'stake'}
		: undefined;
}

/**
 * WHAT THIS APP'S BROWSER KEY IS FOR, in this app's own words.
 *
 * Inherited plumbing, app-specific answer. The template owns the sentences it
 * lands in (see `ui/delegation/grant.ts`); this is the verb phrase inside them,
 * and it is shown in the two places where being wrong is most expensive: the
 * dialog asking the user to authorise a key, and the account panel row saying
 * what that key can do.
 *
 * Upstream this said "post greetings", because upstream's demo posts greetings
 * and the sentence was hard-coded in shared code. A game inheriting that told
 * its players the key was for posting greetings. If you fork THIS template,
 * change this line.
 */
export const SIGNER_GRANT: SignerGrant = {action: 'play your moves'};

/** This game's types, as the commit-reveal skeleton is told them. */
type PlacementGame = {
	identity: GameIdentity;
	action: Placement;
	board: HeldBoardState;
	view: BoardView;
	planning: PlanningStore;
	missedReveal: MissedRevealStore;
	stake: {step: 'stake'};
	surface: GameSurface;
	/** What the layers keep with a turn: `with/fuzd`'s schedule. */
	extensions: FuzdExtensions;
};

export function createGameContext(core: CoreServices): GameContext {
	/**
	 * WHO IS SIGNED IN: the account owns, and the local signer acts for it,
	 * authorised on chain by `registerDelegate`. Undefined until the player
	 * connects, which the setup gate turns into an instruction.
	 */
	const account = core.account;

	/**
	 * WHO IS PLAYING, which is a different question from who is signed in: the
	 * submission, the secret, the stake and the storage key are keyed by THIS,
	 * and a game whose identity is a token keys them by the token. The same value
	 * as `account` here and deliberately not the same name; see
	 * `$lib/game/identity`. Built through a provider because D6 requires identity
	 * to be a SELECTION even where there is exactly one.
	 */
	const activeIdentity = createActiveIdentity({account});

	// `.get()`: deployments are fixed for the life of the app, and the game's
	// readers need them synchronously at construction.
	const deployments = core.deployments.get();
	const config = resolvePlacementConfig(deployments);
	const contract = gameContract(deployments);

	// The stake is filed under WHO PLAYS, not under who signed in.
	const reserve = createReserve({deps: core, config, identity: activeIdentity});

	// Keyed by WHO PLAYS, which is what the contract's commitment is keyed by,
	// in the account data, so it is synced and encrypted with it.
	//
	// Typed with the layers' extensions (`with/fuzd`'s schedule), so what fuzd
	// recorded comes back typed; the format is this game's.
	const storageFor = (player: GameIdentity) =>
		createAccountDataSubmissionStorage<Placement, FuzdExtensions, GameIdentity>(
			{
				accountData: core.accountData,
				format: PLACEMENT_STORAGE,
				chainId: deployments.chain.id,
				contract: deployments.contracts.Game.address,
				identity: player,
			},
		);

	// WHO REVEALS (P7). With fuzd configured, fuzd sends the reveal as the
	// phase opens and this browser falls back at half of it; without it (no
	// `PUBLIC_FUZD_URI`, a chain with no `expectedWorstGasPrice`, or the
	// offline world, whose chain a service cannot reach), it reveals at once,
	// as on `main`.
	const fuzd = fuzdSettings({
		// DYNAMIC, not static: an unset variable is the layer's absence (R2),
		// not a build error.
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

	// THE GAME'S RULE, RUN FROM ITS OWN BYTECODE. The Simulation route's code is
	// read once from whatever chain the app is on and run in a sandbox of its
	// own, so the preview of a plan is the rule the reveal applies. Nothing is
	// fetched or started until a cell is planned. See `$lib/placement/preview`.
	const sandbox = createBytecodeSandbox({
		provider: core.publicClient,
		contracts: {
			rules: {
				address:
					deployments.contracts.Game_Implementation_Router_Simulation_Route
						.address,
			},
		},
	});
	const simulate = async (
		cells: Parameters<
			Parameters<typeof createPlacementPreview>[0]['simulate']
		>[0],
		placements: readonly Placement[],
	) =>
		sandbox.call({
			contract: 'rules',
			abi: deployments.contracts.Game.abi,
			functionName: 'resolvePlacements',
			args: [cells, placements],
		});
	const stakeOf = (cellID: bigint, player: bigint) =>
		core.publicClient.readContract({
			address: deployments.contracts.Game.address,
			abi: deployments.contracts.Game.abi,
			functionName: 'getStakeOnCell',
			args: [cellID, player],
		});

	// The commit-reveal wiring is the framework's; what follows is this game.
	const crg = createCommitRevealGame<PlacementGame>(core, {
		identity: activeIdentity,
		contract: deployments.contracts.Game.address,
		cycle: {
			config: config.cycle,
			readCycle: createCycleReader({publicClient: core.publicClient, contract}),
			readAttendance: createAttendanceReader({
				publicClient: core.publicClient,
				contract,
			}),
			advance: createCycleAdvancer({deps: core, contract}),
			// YES, AND IT IS THIS GAME'S CONTRACT THAT SAYS SO, not the framework.
			// `UsingCommitReveal._advanceCycle` re-checks the policy, `waitedFor > 0`,
			// `committed >= waitedFor` in the commit phase and `revealed >= committed`
			// in the reveal phase, and reverts with a named error for each - so the
			// client's mirrored guard is an optimisation and nothing is riding on
			// it. See `game/core/advance.ts`.
			contractIsTheJudge: true,
		},
		// THE DEPLOYMENT'S CHUNK SIZE: it bounds how much of a turn can still be
		// opened, and it is part of the commitment's hash (see `buildCommitment`).
		actionsPerReveal: config.actionsPerReveal,
		camera: config.camera,
		board: ({poll}) =>
			poll<BoardState>({
				zonesForCamera,
				read: createBoardReader({publicClient: core.publicClient, deployments}),
				emptyState: emptyBoard,
			}),
		// The forfeit comes out of the reserve, so the number on screen changes.
		// The committed turn is what lets a missed reveal be settled WITH its
		// chunks, which forfeits only what the placements would have cost.
		missedReveal: () =>
			createMissedReveal({
				deps: core,
				config,
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
			createPlacementCommitReveal({deps: core, config, beforeCommit}),
		// THE DEPLOYMENT'S CHUNK SIZE, not a default, and recovery is where getting
		// it wrong is worst: the same actions and secret hash to a DIFFERENT head
		// at a different chunk size, so a check run at the wrong size tells a
		// player their plan was not what they committed, during the one cycle in
		// which the stake can still be saved.
		buildCommitment: ({actions, secret}) =>
			buildPlacementCommitment({
				actions,
				secret,
				actionsPerReveal: config.actionsPerReveal,
			}),
		storageFor,
		...(scheduler ? {scheduler} : {}),
		submission: revealModeFor(scheduler !== undefined),
		// The type this game constructs at its own boundary, not a fresh look at
		// the node's wording: retrying any other failure would burn the top-up.
		isOutOfGas: (error) => error instanceof SignerOutOfFundsError,
		stake: {
			refresh: () => reserve.update(),
			needed: derived(reserve, stakeNeeded),
			acquisition: createStakeAcquisition({config, deployments}),
			grant: SIGNER_GRANT,
		},
		// The plan the view draws carries what the planned cells will hold, once
		// the sandbox has answered for exactly that plan.
		planning: ({submission, maxOpenableActions, onchainState}) => {
			const planning = createPlanning({
				submission,
				maxActions: maxOpenableActions,
			});
			const preview = createPlacementPreview({
				plan: planning.plan,
				board: onchainState,
				player: derived(activeIdentity, ($identity) =>
					$identity === undefined ? undefined : onchainIdentity($identity),
				),
				simulate,
				stakeOf,
			});
			return {...planning, plan: withPreview(planning.plan, preview)};
		},
		// What the resolving cycle changed is held back until it is over; see
		// `$lib/placement/hold`.
		hold: holdResolvingCycle,
		holdPlan: holdPlanUntilBoardReleases,
		merge: mergeBoardView,
		renderer: ({viewState}) =>
			createGameRenderer({viewState, cellSize: config.cellSize}),
		// The canvas reports WHERE, in game units and unsnapped; which cell that
		// is, is this game's rule. Rounded rather than floored because cells are
		// centred on their integer coordinate (the cell at 3,4 spans 2.5..3.5).
		click: (position, {planning}) =>
			planning.toggle(cellID(Math.round(position.x), Math.round(position.y))),
		start: () => {
			// The reserve is keyed by the identity, so it follows the identity.
			void reserve.update();
			const stop = activeIdentity.subscribe(() => void reserve.update());
			return () => {
				stop();
				sandbox.dispose();
			};
		},
	});

	const cost = derived(
		crg.game.planning.count,
		($count) => BigInt($count) * config.placementCost,
	);

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
		game: {...crg.game, config, activeIdentity, reserve, cost, revealSchedule},
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

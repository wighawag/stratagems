/**
 * THE COMMIT-REVEAL SKELETON: the wiring every game on this template used to
 * write for itself.
 *
 * The framework already owned every MECHANISM a composition wires (chain time,
 * the cycle trackers, the advance, the submission, the secret, recovery, the
 * handover). What it did not own was the wiring BETWEEN them, and that wiring
 * was the same in every game: measured on 2026-10-24, 181 of the 260 code lines
 * of the reference game's composition were unchanged in reveal-or-die's, and
 * bomber-world's differed from reveal-or-die's by seventeen lines. A third game
 * (stratagems) was about to write a fourth copy.
 *
 * THE SKELETON DECIDES WHEN; THE GAME SAYS WHAT. Chain time feeds the cycle
 * trackers; the trackers feed the phases, the advance and the submission; the
 * submission, the secret and recovery share one derivation; the held board
 * feeds the view; and `start()` re-checks the missed reveal on an identity
 * change, on a submission ending in `Missed` and on a cycle turnover, pokes the
 * advance when a submission lands, resumes when gas arrives and refreshes when
 * a pending acquisition settles. None of that is a game's choice, so none of it
 * is a parameter.
 *
 * Everything that IS a game's choice is handed in: its readers and advancer
 * (the contract surface is not inherited, so the skeleton never calls a
 * contract function itself), its board store (a poller in the reference game,
 * an indexer in stratagems: the skeleton must not build one), its adapter and
 * commitment hashing, its stake, its missed-reveal reader, its planning, its
 * hold rule and merge, and what a click means. A part that needs something the
 * skeleton builds is handed in as a FACTORY, called in the order the wiring
 * needs, so the game never has to know that order.
 *
 * Generic over identity and action like `createSubmission`, and names no game.
 * Constructed synchronously and off-browser, like the rest of the context:
 * nothing here starts IO, which belongs to `start()`. See ADR-0002 (jolly-roger).
 */
import {derived, get, readable, type Readable} from 'svelte/store';
import type {CoreServices} from '$lib/context/core';
import {isRegistered, type DelegationValue} from '$lib/onchain/delegation';
import {createChainTime, type ChainTimeStore} from './chain-time';
import {
	createCycleTrackers,
	createThreePhase,
	staticCycleConfig,
	type CycleConfig,
	type CycleInfoStore,
	type CycleReading,
	type ThreePhase,
	type TwoPhase,
} from './cycle';
import {
	createCycleAdvance,
	type Attendance,
	type CycleAdvanceStore,
} from './advance';
import {
	createSubmission,
	type SubmissionState,
	type SubmissionStorage,
	type SubmissionStore,
} from './submission';
import {createDerivedSecret, type SignMessage} from './secret';
import {
	createSubmissionRecovery,
	type LiveCommitment,
	type RecoveryStore,
} from './recovery';
import {
	holdBoardUntilCycleEnds,
	type HeldBoard,
	type HoldResolvingCycle,
} from './handover';
import {boardIsBehindClock, cyclePhaseOf, type CyclePhase} from './cycle-phase';
import {
	actionsOpenableInRevealPhase,
	receiptPollingInterval,
} from './reveal-window';
import type {
	CommitRevealAdapter,
	GameRenderer,
	OnchainStateStore,
	PlayerIdentity,
	ViewStateStore,
} from './seams';
import {
	createAcquisition,
	refreshWhenPendingAcquisitionSettles,
	type AcquisitionStore,
} from '$lib/game/acquire';
import {
	createCanvasEventEmitter,
	type CanvasEventEmitter,
} from '$lib/game/render/events';
import {
	createCamera,
	type CameraConfig,
	type CameraControl,
	type CameraWatcher,
} from '$lib/game/render/camera';
import {createViewState, type ViewMerge} from '$lib/view';
import {createPollingOnchainState} from '$lib/onchain/state';

// ---------------------------------------------------------------------------
// The pieces, each its own function so it can be tested without an app context.
// ---------------------------------------------------------------------------

/**
 * What stands between the player and their first move, in the order it has to
 * happen, so the UI only ever asks for one thing.
 *
 * The framework's half is the two ends: somebody signed in, and this browser
 * allowed to act for them. Between them is the game's own question, what it
 * needs at stake (a reserve, an avatar in custody), and it comes BEFORE the
 * authorisation because acquiring a stake carries the authorisation with it:
 * the purchase funds the signer, which registers itself out of the stipend, so
 * asking to authorise first would demand a transaction the next step includes.
 */
export type SetupNeeded<TStake extends {step: string}> =
	{step: 'sign-in'} | TStake | {step: 'authorise'};

/**
 * The gate, as a pure function, because the two ways to get a gate wrong are
 * opposites: too strict and it hides a playable board behind a demand the
 * player has already met, too loose and it invites a turn that reverts.
 */
export function setupNeeded<TStake extends {step: string}>(params: {
	/** THE ACCOUNT: whether anyone is signed in at all. */
	account: `0x${string}` | undefined;
	/**
	 * The delegation read, already SCOPED to this browser's signer: the chain was
	 * asked about the (account, signer) pair, so `allowed` is about this browser.
	 */
	delegation: DelegationValue;
	/**
	 * The game's answer, already computed: what it still needs at stake, or
	 * undefined. An unfinished read must answer undefined, not "nothing at
	 * stake", or the gate covers a playable board on every load until it lands.
	 */
	stake: TStake | undefined;
}): SetupNeeded<TStake> | undefined {
	if (!params.account) return {step: 'sign-in'};
	if (params.stake) return params.stake;
	// Still reachable once a stake exists: a second browser, or a revoked one,
	// has nothing left to buy to fold the authorisation into.
	if (params.delegation.step === 'Loaded' && !isRegistered(params.delegation)) {
		return {step: 'authorise'};
	}
	return undefined;
}

/**
 * Whether a turn can be taken right now: setup done, and, for a game that says
 * so, the cycle in the window where moves mean anything.
 *
 * `onlyInPlayPhase` is the game's choice. A game whose plan is built from its
 * own position (reveal-or-die) must not plan during the reveal or the
 * catch-up, because what the plan is built from is about to change; a game
 * whose plan is a set of cells (the reference game) has nothing to go stale.
 */
export function canTakeTurnNow(params: {
	setup: unknown;
	phase: CyclePhase;
	onlyInPlayPhase: boolean;
}): boolean {
	if (params.setup !== undefined) return false;
	return !params.onlyInPlayPhase || params.phase === 'play';
}

/**
 * Carry on once the gas arrives.
 *
 * A move that failed for want of gas is the one failure the player can fix, and
 * the fix happens elsewhere (the top-up flow, a faucet, a transfer by hand).
 * Watching the SIGNER'S BALANCE rather than the flow keeps the two decoupled:
 * whatever put gas in the account, the submission resumes. It matters most for
 * a reveal, where the window is short and the stake already committed.
 *
 * This is the one piece of wiring that SPENDS the player's gas without being
 * asked, so it resumes only for the failure the money fixes, as the game's own
 * boundary classified it (`isOutOfGas`), and never on the first reading or on a
 * balance that fell.
 */
export function resumeWhenGasArrives<TAction>(params: {
	submission: Pick<
		SubmissionStore<PlayerIdentity, TAction>,
		'subscribe' | 'value' | 'commit' | 'reveal'
	>;
	signerBalance: Readable<{step: string; value?: bigint}>;
	isOutOfGas: (error: unknown) => boolean;
}): () => void {
	const {submission, signerBalance, isOutOfGas} = params;
	let gasSeen: bigint | undefined;

	return signerBalance.subscribe(($balance) => {
		if ($balance.step !== 'Loaded' || $balance.value === undefined) return;
		const previous = gasSeen;
		gasSeen = $balance.value;
		if (previous === undefined || $balance.value <= previous) return;

		const $submission = submission.value;
		if ($submission.step !== 'Error' || !isOutOfGas($submission.error)) return;
		// Which one is not a detail: revealing when a commit failed would send a
		// reveal for a commitment that was never made.
		if ($submission.during === 'reveal') void submission.reveal();
		else void submission.commit();
	});
}

/**
 * Run something once per cycle, on the turnover.
 *
 * `cycleInfo` re-emits on every tick of the clock, so the trigger is the CHANGE
 * and not the value; and the first emission is not a change either, since
 * `start()` has just done the initial reads. (From reveal-or-die, where it grew
 * first; the reference game had the same loop inline.)
 */
export function onEachNewCycle(params: {
	cycleInfo: Readable<{currentCycleNumber: number}>;
	run: () => void;
}): () => void {
	let lastCycleNumber: number | undefined;
	return params.cycleInfo.subscribe(($cycle) => {
		if (
			lastCycleNumber !== undefined &&
			$cycle.currentCycleNumber !== lastCycleNumber
		) {
			params.run();
		}
		lastCycleNumber = $cycle.currentCycleNumber;
	});
}

/**
 * Sign with the LOCAL SIGNER, silently, for the commit secret.
 *
 * The SIGNER and not the account, and the reason is the whole feature: sign-in
 * derives the signer from an origin-scoped signature, so the same account
 * derives the same signer on any device and the secret comes back with it.
 * Signing with the account would put a wallet prompt on every commit.
 *
 * It THROWS without a signer rather than falling back to a random secret: a
 * silent fallback produces a submission that looks identical and is not
 * recoverable, which is the failure this exists to prevent.
 */
export function signWithLocalSigner(
	signerExecutor: CoreServices['signerExecutor'],
): SignMessage {
	return async (message) => {
		const executor = get(signerExecutor);
		const signerAccount =
			executor.status === 'ready' ? executor.account : undefined;
		if (
			!signerAccount ||
			typeof signerAccount === 'string' ||
			!signerAccount.signMessage
		) {
			throw new Error(
				'Cannot derive the commit secret: no local signer is available.',
			);
		}
		return signerAccount.signMessage({message});
	};
}

/** Storage for nobody: what the submission gets while no identity is playing. */
function noStorage<TAction>(): SubmissionStorage<TAction> {
	return {load: () => undefined, save: () => {}, clear: () => {}};
}

// ---------------------------------------------------------------------------
// The skeleton.
// ---------------------------------------------------------------------------

/** What the skeleton needs to know about a game's missed-reveal reader. */
export type MissedRevealReader<TValue> = {
	readonly value: TValue;
	/** Re-read the chain. The skeleton decides when. */
	check(): Promise<void>;
	/** The live commitment it read, which recovery is wired from. */
	commitment: Readable<LiveCommitment | undefined>;
};

/** What the skeleton builds before the game's factories are called. */
export type CycleClock = {
	chainTime: ChainTimeStore;
	cycleInfo: CycleInfoStore;
	twoPhase: Readable<TwoPhase>;
	currentCycleNumber: Readable<number>;
};

/**
 * What a board store is built from: the clock, and for a game that POLLS, the
 * template's poller already wired to it.
 *
 * `poll` is an offer, not the board: the skeleton builds nothing until the game
 * asks, so a game whose board comes from an indexer simply ignores it. What it
 * saves a polling game is the wiring every one of them repeated (the client,
 * the clock, the cycle's length for the log range, the fetch gate), leaving
 * only what is the game's: the camera, the zones, the reader, the empty board.
 */
export type BoardSource = CycleClock & {
	/** What the player is looking at, which a camera-scoped board reads. */
	camera: CameraWatcher;
	poll: <TState>(
		params: Pick<
			Parameters<typeof createPollingOnchainState<TState>>[0],
			'zonesForCamera' | 'read' | 'emptyState' | 'config'
		>,
	) => OnchainStateStore<TState & {cycleNumber: number}>;
};

/**
 * THE GAME'S TYPES, named once.
 *
 * One record rather than nine type parameters, because a composition has
 * factories whose arguments the skeleton supplies, and TypeScript cannot infer
 * a type parameter through those: the game declares the record and passes it,
 * `createCommitRevealGame<MyGame>(...)`, and every part is checked against it.
 */
export type GameTypes = {
	/** WHO PLAYS. Use the alias from `$lib/game/identity`. */
	identity: PlayerIdentity;
	/** One planned action of a turn. */
	action: unknown;
	/** The board store's loaded value, stamped with its cycle. */
	board: {cycleNumber: number};
	/** What the view draws. */
	view: unknown;
	/** The game's planning store; its `plan` is what the view overlays. */
	planning: {plan: Readable<unknown>};
	/** The game's missed-reveal reader. */
	missedReveal: MissedRevealReader<unknown>;
	/** The game's step of the setup gate. */
	stake: {step: string};
	/** The game's choice of rendering surface, named in its own render module. */
	surface: unknown;
};

type LocalOf<T extends GameTypes> =
	T['planning']['plan'] extends Readable<infer L> ? L : never;
type MissedValueOf<T extends GameTypes> = T['missedReveal']['value'];

export type CommitRevealGameParts<T extends GameTypes> = {
	/** WHO PLAYS: what the submission, the secret and the storage are keyed by. */
	identity: Readable<T['identity'] | undefined>;
	/** The game contract: the secret is domain-separated by it. */
	contract: `0x${string}`;
	cycle: {
		/** The deployment's cycle policy and durations. */
		config: CycleConfig;
		readCycle: () => Promise<CycleReading>;
		readAttendance: () => Promise<Attendance>;
		advance: () => Promise<unknown>;
		/**
		 * Does THIS GAME'S CONTRACT re-check an advance? The game's to answer from
		 * its own contract, never the framework's: see `advance.ts`.
		 */
		contractIsTheJudge: boolean;
	};
	/**
	 * Actions per reveal chunk, when the game chains its reveal. Bounds how much
	 * of a turn this client could still OPEN before the reveal phase shuts;
	 * without it nothing is bounded.
	 */
	actionsPerReveal?: number;
	/**
	 * The board store, built by the game: a poller, an indexer, anything that
	 * satisfies the seam and stamps each loaded value with its cycle.
	 */
	/** What the camera may show, in game units. */
	camera: CameraConfig;
	board: (source: BoardSource) => OnchainStateStore<T['board']>;
	/** The game's missed-reveal reader, and whether its answer blocks a commit. */
	missedReveal: (clock: CycleClock) => T['missedReveal'];
	blocksCommitting: (value: MissedValueOf<T>) => boolean;
	/**
	 * The adapter, given the guard to run before every commit: refuse while an
	 * unrevealed commitment is in the way, in words the player can act on.
	 */
	adapter: (guard: {
		beforeCommit: () => Promise<void>;
	}) => CommitRevealAdapter<T['identity'], T['action']>;
	/** The hash the commitment is, exactly as the adapter commits it. */
	buildCommitment: (params: {
		actions: readonly T['action'][];
		secret: `0x${string}`;
	}) => {hash: `0x${string}`};
	/** Where one identity's submission persists. A wire: see AGENTS.md. */
	storageFor: (identity: T['identity']) => SubmissionStorage<T['action']>;
	/**
	 * Passed through to `createSubmission`, each one only when the game chose it,
	 * so a game that says nothing keeps the submission's own defaults
	 * (`autoReveal: 'immediately'`, `fallbackRevealAfter: 0.5`).
	 */
	submission?: Pick<
		Parameters<typeof createSubmission>[0],
		'commitWhenIdle' | 'autoReveal' | 'fallbackRevealAfter'
	>;
	/** Whether a failed move failed for want of the signer's gas. */
	isOutOfGas: (error: unknown) => boolean;
	stake: {
		/** Re-read what the player has at stake. */
		refresh: () => Promise<unknown> | void;
		/** The game's step of the setup gate, or undefined. */
		needed: Readable<T['stake'] | undefined>;
		/** How a stake is acquired, and the grant the signer is shown with. */
		acquisition: Parameters<typeof createAcquisition>[0]['acquisition'];
		grant: Parameters<typeof createAcquisition>[0]['grant'];
	};
	/**
	 * The game's planning store. Handed the clock and the RAW board as well as
	 * the submission, for a game whose legal moves depend on what the chain
	 * holds this cycle (bomber-world's bombs): that is about the chain, not
	 * about what the held board shows.
	 */
	planning: (
		params: CycleClock & {
			submission: SubmissionStore<T['identity'], T['action']>;
			maxOpenableActions: Readable<number | undefined>;
			onchainState: OnchainStateStore<T['board']>;
		},
	) => T['planning'];
	/** What the resolving cycle may not show yet, and the display copy of the plan. */
	hold: HoldResolvingCycle<T['board']>;
	holdPlan: (params: {
		submission: Readable<SubmissionState<T['action']>>;
		plan: Readable<LocalOf<T>>;
		holding: Readable<number | undefined>;
	}) => Readable<LocalOf<T>>;
	merge: ViewMerge<T['board'], LocalOf<T>, T['view']>;
	/** The game's renderer, drawing the view. */
	renderer: (params: {
		viewState: ViewStateStore<T['view']>;
	}) => GameRenderer<T['surface']>;
	/** What a click means, in game units and unsnapped. Ignored until ready. */
	click: (
		position: {x: number; y: number},
		parts: {planning: T['planning']},
	) => void;
	/** See `canTakeTurnNow`. */
	onlyInPlayPhase?: boolean;
	/** The game's own IO, started with the skeleton's. Returns its teardown. */
	start?: () => () => void;
};

export type CommitRevealGame<T extends GameTypes> = {
	/**
	 * What a game's own `Game` member is built from: spread it, and add the
	 * game's parts beside it.
	 */
	game: CycleClock & {
		/**
		 * WHO IS SIGNED IN: the account, which owns. Not who PLAYS, which is the
		 * game's `activeIdentity`; not the local signer, which sends.
		 */
		identity: CoreServices['account'];
		threePhase: Readable<ThreePhase>;
		/** The four-part model the HUD draws: `threePhase` plus the board's lag. */
		phase: Readable<CyclePhase>;
		cycleAdvance: CycleAdvanceStore;
		submission: SubmissionStore<T['identity'], T['action']>;
		planning: T['planning'];
		missedReveal: T['missedReveal'];
		recovery: RecoveryStore<T['action']>;
		acquisition: AcquisitionStore;
		setup: Readable<SetupNeeded<T['stake']> | undefined>;
		readyToPlay: Readable<boolean>;
	};
	/** The board as the chain says it. What FETCHES reads this. */
	onchainState: OnchainStateStore<T['board']>;
	/** The board as the player is shown it: the resolving cycle held back. */
	heldBoard: HeldBoard<T['board']>;
	viewState: ViewStateStore<T['view']>;
	/** The one secret derivation, for a game that searches for a lost turn. */
	makeSecret: (params: {
		cycleNumber: number;
		identity: T['identity'];
	}) => Promise<`0x${string}`>;
	maxOpenableActions: Readable<number | undefined>;
	/**
	 * The render seam: the camera, the game's renderer, and the canvas's events.
	 * Nothing here names a rendering library; `T['surface']` is the game's.
	 */
	render: {
		camera: CameraWatcher;
		cameraControl: CameraControl;
		gameRenderer: GameRenderer<T['surface']>;
		eventEmitter: CanvasEventEmitter;
	};
	/** Begin the IO, the game's `start` included. Returns the teardown. */
	start(): () => void;
};

export function createCommitRevealGame<T extends GameTypes>(
	core: CoreServices,
	parts: CommitRevealGameParts<T>,
): CommitRevealGame<T> {
	type TIdentity = T['identity'];
	type TAction = T['action'];
	type TBoard = T['board'];
	type TLocal = LocalOf<T>;
	type TView = T['view'];
	type TStake = T['stake'];
	const {identity} = parts;
	const chainId = core.deployments.get().chain.id;

	// Chain-synced, unlike the UI clock: the phases are defined against block
	// timestamps, and a drifting browser clock would show the wrong phase.
	const chainTime = createChainTime({
		publicClient: core.publicClient,
		minPollingInterval: 100,
	});
	// WHICH CLOCK THE DEPLOYMENT RUNS: timed is arithmetic and asks the chain
	// nothing; manual and hybrid can be moved by a transaction, so the chain is
	// the authority and `chainTime` only predicts between reads.
	const {
		cycleInfo,
		twoPhase,
		refresh: refreshCycle,
	} = createCycleTrackers({
		chainTime,
		config: staticCycleConfig(parts.cycle.config),
		readCycle: parts.cycle.readCycle,
	});
	const threePhase = createThreePhase(cycleInfo);
	const currentCycleNumber = derived(
		cycleInfo,
		($cycle) => $cycle.currentCycleNumber,
	);
	const clock: CycleClock = {
		chainTime,
		cycleInfo,
		twoPhase,
		currentCycleNumber,
	};

	// Built for every policy and INERT under the timed one; under `manual` it is
	// what makes a round completable at all.
	const cycleAdvance = createCycleAdvance({
		cycleInfo,
		readAttendance: parts.cycle.readAttendance,
		advance: parts.cycle.advance,
		refreshCycle,
		contractIsTheJudge: parts.cycle.contractIsTheJudge,
	});

	const {camera, cameraControl} = createCamera(parts.camera);
	const {commitPhaseDuration, revealPhaseDuration} = parts.cycle.config;
	const onchainState = parts.board({
		...clock,
		camera,
		poll: (params) =>
			createPollingOnchainState({
				...params,
				camera,
				publicClient: core.publicClient,
				cycleInfo,
				chainTime,
				cycleDuration: commitPhaseDuration + revealPhaseDuration,
				fetchGate: core.chainFetchGate,
			}),
	});

	// A comparison, not a state machine, so it cannot go stale: see
	// `cycle-phase.ts` for the rule and the trap it avoids.
	const boardBehindClock = derived(
		[currentCycleNumber, onchainState],
		([$cycle, $state]) =>
			boardIsBehindClock({
				board: $state as {step: string; cycleNumber?: number},
				currentCycleNumber: $cycle,
			}),
	);
	const phase = derived([threePhase, boardBehindClock], ([$three, $behind]) =>
		cyclePhaseOf($three, $behind),
	);

	const acquisition = createAcquisition({
		deps: core,
		acquisition: parts.stake.acquisition,
		// THE ACCOUNT, not the identity: a purchase is credited to whoever owns
		// the result, even when what it buys is a token.
		owner: core.account,
		grant: parts.stake.grant,
		// The stake exists the moment the transaction lands, so re-reading is what
		// takes the player past the setup gate and onto the board.
		onAcquired: () => void parts.stake.refresh(),
	});

	// Resolved per call rather than captured: the identity can change while the
	// app runs, and a pending submission filed under another one would fail to
	// reveal and read as a contract bug.
	function forCurrentIdentity(): SubmissionStorage<TAction> {
		const player = get(identity);
		// `=== undefined`, not falsy: an identity that is a token id can be `0n`.
		if (player === undefined) return noStorage();
		return parts.storageFor(player);
	}
	const storage: SubmissionStorage<TAction> = {
		load: () => forCurrentIdentity().load(),
		save: (submission) => forCurrentIdentity().save(submission),
		clear: () => forCurrentIdentity().clear(),
	};

	const missedReveal = parts.missedReveal(clock);

	// ONE derivation, shared by the submission and by recovery (and by any search
	// a game runs): they must reproduce EXACTLY what was committed with, and two
	// constructions would agree today and diverge the day one is edited.
	const makeSecret = createDerivedSecret<TIdentity>({
		sign: signWithLocalSigner(core.signerExecutor),
		chainId,
		contract: parts.contract,
	});

	const submission = createSubmission<TIdentity, TAction>({
		cycleInfo,
		// DERIVED, not random, so a cleared browser does not cost the stake. What
		// it does not recover is the ACTIONS: see `recovery.ts`.
		makeSecret,
		adapter: parts.adapter({
			// Acknowledging a missed reveal forfeits, so it is never done on the
			// player's behalf; refusing here is what makes the reason visible
			// instead of a bare revert.
			beforeCommit: async () => {
				await missedReveal.check();
				if (parts.blocksCommitting(missedReveal.value)) {
					throw new Error(
						'An earlier commitment was never revealed. Acknowledge the missed reveal to play again.',
					);
				}
			},
		}),
		storage,
		identity,
		...(parts.submission?.commitWhenIdle
			? {commitWhenIdle: parts.submission.commitWhenIdle}
			: {}),
		// WHEN THIS BROWSER REVEALS is the game's choice (P7): `fallback` where a
		// scheduler is expected to reveal, `immediately` otherwise. Before this the
		// skeleton passed only `commitWhenIdle`, so no game could choose.
		...(parts.submission?.autoReveal
			? {autoReveal: parts.submission.autoReveal}
			: {}),
		...(parts.submission?.fallbackRevealAfter !== undefined
			? {fallbackRevealAfter: parts.submission.fallbackRevealAfter}
			: {}),
		// Awaited before the submission reports itself revealed, so the confirmed
		// moves are on the board by the time the planned ones stop being drawn.
		onSettled: async () => {
			await Promise.all([onchainState.update(), parts.stake.refresh()]);
		},
	});

	// How much of a turn could still be OPENED before the reveal phase shuts,
	// from the measured block time. Undefined bounds nothing: before the first
	// sync, under a manual cycle (no deadline), or for a game with no chunks.
	const {actionsPerReveal} = parts;
	const maxOpenableActions: Readable<number | undefined> =
		actionsPerReveal === undefined
			? readable(undefined)
			: derived(chainTime, ($chainTime) => {
					const averageBlockTime = $chainTime.lastSync?.averageBlockTime;
					if (averageBlockTime === undefined) return undefined;
					return actionsOpenableInRevealPhase({
						revealPhaseDuration,
						averageBlockTime,
						pollingInterval: receiptPollingInterval(revealPhaseDuration),
						actionsPerReveal,
					});
				});

	const planning = parts.planning({
		...clock,
		submission,
		maxOpenableActions,
		onchainState,
	});

	// The chain says a commitment exists; this browser may not know it.
	const recovery = createSubmissionRecovery<TIdentity, TAction>({
		submission,
		commitment: missedReveal.commitment,
		identity,
		makeSecret,
		buildCommitment: parts.buildCommitment,
	});

	// THE HELD BOARD: reveals land in mempool order, so a board that drew each as
	// it landed would play a simultaneous cycle out in payment order. Fetching
	// keeps reading the raw store; this is only what the player is shown.
	const heldBoard = holdBoardUntilCycleEnds<TBoard>({
		state: onchainState,
		phase: twoPhase,
		cycleNumber: currentCycleNumber,
		hold: parts.hold,
	});

	const viewState = createViewState<TBoard, TLocal, TView>({
		onchainState: heldBoard.board as OnchainStateStore<
			TBoard & {cycleNumber: number}
		>,
		// THE DISPLAY COPY of the plan, released by the board's own signal, so the
		// overlay and the board's account of the turn hand over with nothing in
		// between. Everything that ACTS on a turn keeps reading `planning.plan`.
		localState: parts.holdPlan({
			submission,
			// The record's constraint is `Readable<unknown>`; `LocalOf` is what it
			// actually holds, which TypeScript cannot see inside the generic.
			plan: planning.plan as Readable<TLocal>,
			holding: heldBoard.holding,
		}),
		merge: parts.merge,
	});

	const setup = derived(
		[core.account, core.delegation, parts.stake.needed],
		([$account, $delegation, $stake]) =>
			setupNeeded<TStake>({
				account: $account,
				delegation: $delegation,
				stake: $stake,
			}),
	);
	const onlyInPlayPhase = parts.onlyInPlayPhase ?? false;
	const readyToPlay = derived([setup, phase], ([$setup, $phase]) =>
		canTakeTurnNow({setup: $setup, phase: $phase, onlyInPlayPhase}),
	);

	const gameRenderer = parts.renderer({viewState});
	const eventEmitter = createCanvasEventEmitter();

	function start() {
		const stopSubmission = submission.start();
		const stopCycleAdvance = cycleAdvance.start();

		// A click is only a click to the canvas; what it MEANS is the game's, and
		// it means nothing until the player could commit it.
		const onClicked = (position: {x: number; y: number}) => {
			if (!get(readyToPlay)) return;
			parts.click(position, {planning});
		};
		eventEmitter.on('clicked', onClicked);

		// Whether a commitment is outstanding is a fact about the IDENTITY, not
		// about this browser: re-read whenever it changes, which is also how a
		// player who lost their local state finds out.
		void missedReveal.check();
		const unsubscribeIdentity = identity.subscribe(() => {
			void missedReveal.check();
		});

		// Ending in Missed locally means very likely blocked on chain too. And a
		// submission that just LANDED may have completed unanimity: asking then
		// rather than on the next poll is what makes a manual round feel instant.
		const unsubscribeSubmission = submission.subscribe(($submission) => {
			if ($submission.step === 'Missed') void missedReveal.check();
			if ($submission.step === 'Committed' || $submission.step === 'Revealed') {
				void cycleAdvance.check();
			}
		});

		const unsubscribeGas = resumeWhenGasArrives({
			submission,
			signerBalance: core.signerBalance,
			isOutOfGas: parts.isOutOfGas,
		});

		// A purchase in flight when the tab was last closed finishes with nobody
		// watching; without this the player waits until they reload again.
		const unsubscribeAcquisition = refreshWhenPendingAcquisitionSettles({
			acquisition,
			onSettled: () => void parts.stake.refresh(),
		});

		// Whether a commitment counts as MISSED is a question about the current
		// cycle: the same commitment is live in its cycle and forfeit in the next,
		// so a tab open across the boundary must ask again.
		const unsubscribeCycle = onEachNewCycle({
			cycleInfo,
			run: () => void missedReveal.check(),
		});

		const stopGame = parts.start?.();

		return () => {
			stopSubmission();
			stopCycleAdvance();
			eventEmitter.off('clicked', onClicked);
			unsubscribeIdentity();
			unsubscribeSubmission();
			unsubscribeCycle();
			unsubscribeGas();
			unsubscribeAcquisition();
			stopGame?.();
		};
	}

	return {
		game: {
			identity: core.account,
			chainTime,
			cycleInfo,
			twoPhase,
			currentCycleNumber,
			threePhase,
			phase,
			cycleAdvance,
			submission,
			planning,
			missedReveal,
			recovery,
			acquisition,
			setup,
			readyToPlay,
		},
		onchainState,
		heldBoard,
		viewState,
		makeSecret,
		maxOpenableActions,
		render: {camera, cameraControl, gameRenderer, eventEmitter},
		start,
	};
}

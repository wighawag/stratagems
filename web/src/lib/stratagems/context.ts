/**
 * STRATAGEMS, COMPOSED ON THE TEMPLATE: the game half of the app context.
 *
 * The commit-reveal skeleton (`$lib/game/core/commit-reveal-game`) owns the
 * wiring (the clock, the cycle's phases and its advance, the submission and its
 * secret, recovery, the setup gate, the handover between the plan and the board,
 * the camera); the base's client (`$lib/game/core/commit-reveal/`) owns the calls
 * every game on the base makes. This file hands them stratagems' parts: its
 * move, its board (the etherfold indexer, not a poller), its rules for what a
 * click may plan, its view (`stratagems-common`'s simulation of the planned
 * moves), its stake (gems in the reserve) and a stopgap renderer. It is the
 * reference game's `placement/context.ts` with stratagems' parts in it.
 *
 * Constructed synchronously and off-browser, like the core half: nothing here
 * starts IO, which belongs to `start()` and to the board's first subscriber.
 */
import {derived, type Readable} from 'svelte/store';
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
import {xyToBigIntID} from 'stratagems-common';

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
import {
	createSubmissionStorage,
	loadCommittedTurn,
	submissionStorageKey,
} from './submission-storage';
import {createIndexedBoard, type BoardState} from './board/indexed-board';
import {createPlanning, type PlanningStore} from './planning';
import {holdResolvingCycle, holdPlanUntilBoardReleases} from './hold';
import {createBoardMerge, type BoardView} from './view';
import {createStakeAcquisition, stakeNeeded} from './stake';
import {
	createBoardRenderer,
	type GameSurface,
} from './canvas2d/board-renderer';

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

	const keyFor = (player: GameIdentity) =>
		submissionStorageKey({
			chainID: deployments.chain.id,
			gameAddress,
			player,
		});

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
			createIndexedBoard({
				provider: core.connection.provider as unknown as EIP1193Provider,
				publicClient: core.publicClient,
				deployment: deployments as unknown as Parameters<
					typeof createIndexedBoard
				>[0]['deployment'],
				cycleConfig: config.cycle,
				player: activeIdentity,
				snapshotURI: env.PUBLIC_SNAPSHOT_URI || undefined,
				appPath: url,
			}),
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
				committedTurn: (player) => loadCommittedTurn(keyFor(player)),
				onSettled: () => void reserve.update(),
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
		storageFor: (player) => createSubmissionStorage({key: keyFor(player)}),
		isOutOfGas: (error) => error instanceof SignerOutOfFundsError,
		stake: {
			refresh: () => reserve.update(),
			needed: derived(reserve, stakeNeeded),
			acquisition: createStakeAcquisition({config, deployments}),
			grant: SIGNER_GRANT,
		},
		planning: ({submission, maxOpenableActions, onchainState}) =>
			createPlanning({
				submission,
				maxOpenableActions,
				onchainState,
				identity: activeIdentity,
				maxLife: config.maxLife,
			}),
		hold: holdResolvingCycle,
		holdPlan: holdPlanUntilBoardReleases,
		merge: createBoardMerge(config.maxLife),
		renderer: ({viewState}) =>
			createBoardRenderer({viewState, maxLife: config.maxLife}),
		// Cells are centred on their integer coordinate.
		click: (position, {planning}) =>
			planning.toggle(
				xyToBigIntID(Math.round(position.x), Math.round(position.y)),
			),
		start: () => {
			void reserve.update();
			return activeIdentity.subscribe(() => void reserve.update());
		},
	});

	// What the planned turn would bond, at one gem a placement (a removal costs
	// nothing and returns its gem; the bond is whole chunks either way).
	const cost = derived(crg.game.planning.actions, ($moves) =>
		costOfMoves(config, $moves.filter((move) => move.color !== 0).length),
	);

	return {
		onchainState: crg.onchainState,
		viewState: crg.viewState,
		game: {...crg.game, config, activeIdentity, reserve, cost},
		render: crg.render,
		start: crg.start,
	};
}

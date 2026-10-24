/**
 * Cycles: the commit-reveal clock.
 *
 * This is framework, not a seam. Four independently written games (this one,
 * conquest, reveal-or-die, bomber-world and stratagems) compute the cycle the
 * same way, character for character:
 *
 *     cycleNumber = floor(timePassed / cycleDuration) + 2
 *     committing =
 *         timePassed - (cycleNumber - 2) * cycleDuration < commitPhaseDuration
 *
 * THE INDEX IS `cycleNumber` AND THE INTERVAL IS THE `cycle`, and this formula
 * is why the distinction is worth a word: it puts an index and two durations in
 * one expression, and calling the index by the interval's name is what used to
 * make it readable as a timestamp. See ADR-0001 (template-commit-reveal
 * `work`).
 *
 * The `+ 2` is not arbitrary: the contract starts at cycle 2 so that the
 * hypothetical reveal phase before the first commit phase can be cycle 1.
 *
 * THREE POLICIES, AND ONLY THE FIRST IS PURE ARITHMETIC:
 *
 * - `timed` follows the chain clock and nothing else, which is what a deployed
 *   game does. The formula above IS the answer.
 * - `manual` has no clock at all: the cycle moves when the players have all
 *   acted and someone pushes it, so the only way to know where it is is to ask.
 * - `hybrid` (timed with early advance) has the clock as a DEADLINE, with
 *   unanimity able to bring the next phase forward. The formula is then a
 *   FLOOR rather than an answer, because an advance is a transaction and no
 *   amount of arithmetic predicts one.
 *
 * Which is why, under the last two, the cycle is READ FROM THE CHAIN and the
 * local clock is only a predictor. Getting that the wrong way round is the
 * expensive mistake: a client that trusted its own arithmetic would let a
 * player plan into a window that had already closed, and the loss lands on the
 * stake rather than on the screen.
 */
import {optionalNumber, readNumber, type DeclaredValues} from './linked-data';
import {derived, get, type Readable} from 'svelte/store';
import type {ChainTimeStore} from './chain-time';

/**
 * How the cycle advances. The client's half of `UsingGameTypes.CyclePolicy`.
 *
 * DECLARED BY THE DEPLOYMENT, never inferred. It used to be inferred, on both
 * sides: a game whose two phase durations were zero was a manual game, and was
 * also a game that skipped its commit phase, because one derivation stood for
 * two unrelated things. That is what made this look like a mode rather than a
 * policy.
 */
export type CyclePolicy = 'timed' | 'manual' | 'hybrid';

export type CycleConfig = {
	commitPhaseDuration: number;
	revealPhaseDuration: number;
	startTime: number;
	/**
	 * Margin at the end of the commit phase during which the UI stops accepting
	 * new moves, so a commit still has time to land before the phase closes.
	 */
	commitTimeAllowance: number;
	/** How the cycle advances. See {@link CyclePolicy}. */
	policy: CyclePolicy;
};

export type CycleConfigStore = Readable<CycleConfig> & {
	readonly current: CycleConfig;
};

type BaseCycleInfo = {
	currentCycleNumber: number;
	isCommitPhase: boolean;
	config: CycleConfig;
};

/** Everything a countdown needs, and what every clocked policy can answer. */
type CycleTimings = {
	timeLeftInCycle: number;
	timeInCurrentCycle: number;
	timeLeftInPhase: number;
	timeLeftForCommitEnd: number;
	timeLeftForRevealEnd: number;
	currentPhaseDuration: number;
	/**
	 * Chain time at which THIS cycle's reveal phase opens, or opened.
	 *
	 * What an outside scheduler is told at commit time, and the reason it is a
	 * value rather than something a caller recomputes: under `hybrid` an early
	 * advance moves the cycle's origin, so the same arithmetic run against the
	 * deployment's start time answers for a grid the chain has left behind.
	 */
	revealOpensAt: number;
};

export type TimedCycleInfo = BaseCycleInfo & {type: 'timed'} & CycleTimings;

/**
 * The clock as a deadline, with unanimity able to bring a phase forward.
 *
 * Carries the same timings as `timed` on purpose: everything that draws a
 * countdown works unchanged, because an early advance changes WHEN a phase runs
 * and never what a phase is.
 */
export type HybridCycleInfo = BaseCycleInfo & {type: 'hybrid'} & CycleTimings;

/** A chain where cycles only move when someone pushes them. No clock to read. */
export type ManualCycleInfo = BaseCycleInfo & {type: 'manual'};

export type CycleInfo = TimedCycleInfo | HybridCycleInfo | ManualCycleInfo;

/** A cycle info that has a clock behind it, whichever of the two it is. */
export type ClockedCycleInfo = TimedCycleInfo | HybridCycleInfo;

export type CycleInfoStore = Readable<CycleInfo> & {
	now(): CycleInfo;
	fromTime(time: number): CycleInfo;
};

/**
 * The player-facing phase.
 *
 * The contract has two phases; the player sees three, because the tail of the
 * commit phase is a "your commit is landing, moves are locked" window rather
 * than playable time. `twoPhase` collapses that back to play / wait for simple
 * indicators.
 */
export type ThreePhase = {
	phase: 'play' | 'commit' | 'reveal';
	timeLeft: number;
	duration: number;
};

export type TwoPhase =
	| {type: 'timed'; phase: 'play' | 'wait'; timeLeft: number; duration: number}
	| {type: 'manual'; phase: 'play' | 'wait'};

export function calculateCycleInfo(
	currentTime: number,
	config: CycleConfig,
): TimedCycleInfo {
	const commitPhaseDuration = config.commitPhaseDuration;
	const revealPhaseDuration = config.revealPhaseDuration;
	const cycleDuration = commitPhaseDuration + revealPhaseDuration;
	const startTime = config.startTime || 0;

	const timePassed = currentTime - startTime;

	// Cycles start at 2 (see the file comment).
	const currentCycleNumber = Math.floor(timePassed / cycleDuration) + 2;

	const timeInCurrentCycle =
		timePassed - (currentCycleNumber - 2) * cycleDuration;
	const timeLeftInCycle = cycleDuration - timeInCurrentCycle;
	const isCommitPhase = timeInCurrentCycle < commitPhaseDuration;

	return {
		type: 'timed',
		currentCycleNumber,
		isCommitPhase,
		timeLeftInCycle,
		timeInCurrentCycle,
		timeLeftInPhase: isCommitPhase
			? commitPhaseDuration - timeInCurrentCycle
			: revealPhaseDuration - (timeInCurrentCycle - commitPhaseDuration),
		timeLeftForCommitEnd: isCommitPhase
			? commitPhaseDuration - timeInCurrentCycle
			: 0,
		timeLeftForRevealEnd: timeLeftInCycle,
		currentPhaseDuration: isCommitPhase
			? commitPhaseDuration
			: revealPhaseDuration,
		revealOpensAt: revealPhaseStartTime(config, currentCycleNumber),
		config,
	};
}

function threePhaseFrom(info: ClockedCycleInfo): ThreePhase {
	const config = info.config;
	let phase: 'play' | 'commit' | 'reveal' = 'reveal';
	let timeLeft = info.timeLeftInPhase;
	let duration = info.currentPhaseDuration;

	if (info.isCommitPhase) {
		phase = 'play';
		if (info.timeLeftInPhase < config.commitTimeAllowance) {
			phase = 'commit';
			duration = config.commitTimeAllowance;
		} else {
			duration -= config.commitTimeAllowance;
			timeLeft -= config.commitTimeAllowance;
		}
	}
	return {phase, timeLeft, duration};
}

/** Cycles that follow the chain clock. What a deployed game uses. */
export function createTimedCycleTrackers(params: {
	chainTime: ChainTimeStore;
	config: CycleConfigStore;
}): {cycleInfo: CycleInfoStore; twoPhase: Readable<TwoPhase>} {
	const {chainTime, config} = params;

	const _cycleInfo = derived([chainTime, config], ([$chainTime, $config]) =>
		calculateCycleInfo($chainTime.value, $config),
	);

	const cycleInfo: CycleInfoStore = {
		subscribe: _cycleInfo.subscribe,
		now: () => calculateCycleInfo(chainTime.now(), config.current),
		fromTime: (time: number) => calculateCycleInfo(time, config.current),
	};

	const twoPhase = derived<Readable<CycleInfo>, TwoPhase>(
		cycleInfo,
		// The store is built from calculateCycleInfo, so it is always timed.
		($cycleInfo): TwoPhase => twoPhaseFrom($cycleInfo as TimedCycleInfo),
	);

	return {cycleInfo, twoPhase};
}

/**
 * Play against wait, for the simple indicators.
 *
 * Shared by both clocked policies rather than written twice: what a phase MEANS
 * to a player is the same under either, and only when it runs differs.
 */
function twoPhaseFrom(info: ClockedCycleInfo): TwoPhase {
	const three = threePhaseFrom(info);
	const config = info.config;

	let phase: 'play' | 'wait' = 'play';
	let timeLeft = three.timeLeft;
	let duration = three.duration;

	if (three.phase === 'commit') {
		phase = 'wait';
		timeLeft = three.timeLeft + config.revealPhaseDuration;
		duration = three.duration + config.revealPhaseDuration;
	}
	if (three.phase === 'reveal') {
		phase = 'wait';
		duration = three.duration + config.commitTimeAllowance;
	}
	return {type: 'timed', phase, timeLeft, duration};
}

/**
 * WHERE THE CHAIN SAYS THE CYCLE IS, as the game's own cycle reader answered it.
 * Which call that is belongs to the game: two in this tree already spell it
 * differently, and the framework sees this shape either way.
 *
 * `phaseStart` and `phaseEnd` are chain time. They are what make a prediction
 * possible at all: the pair says which grid the cycle is currently on, and
 * under `hybrid` that grid moves when somebody advances early.
 */
export type CycleReading = {
	cycleNumber: number;
	isCommitPhase: boolean;
	phaseStart: number;
	phaseEnd: number;
};

/**
 * Which of two readings is FURTHER ON.
 *
 * The ordering is (cycle, then commit before reveal), and it is total because a
 * cycle only ever moves one way. Used to combine what the chain last said with
 * what the clock has since predicted, and the direction matters: the prediction
 * is a floor, so the answer is whichever is later. Reversing it would let a
 * stale reading pull a phase backwards on screen - and a board that says
 * "commit phase" after the chain has closed it invites a player to plan a turn
 * that cannot be sent.
 */
function laterReading(a: CycleReading, b: CycleReading): CycleReading {
	if (a.cycleNumber !== b.cycleNumber)
		return a.cycleNumber > b.cycleNumber ? a : b;
	if (a.isCommitPhase === b.isCommitPhase) return a;
	return a.isCommitPhase ? b : a;
}

/**
 * Roll a known cycle forward on the clock alone.
 *
 * PURE, AND DELIBERATELY BLIND TO EARLY ADVANCE: an advance is a transaction,
 * so nothing here can know about one. What this produces is the cycle the chain
 * would be in if nobody pushed it, which is the FLOOR that {@link laterReading}
 * combines with the last real answer.
 *
 * The reading's own phase bounds are the anchor rather than the deployment's
 * start time, because under `hybrid` an early advance re-origins the grid, and
 * arithmetic run from the deployment would answer for a schedule the chain has
 * already left.
 */
export function predictCycle(
	reading: CycleReading,
	now: number,
	config: CycleConfig,
): CycleReading {
	const cycleDuration = config.commitPhaseDuration + config.revealPhaseDuration;
	// The ANCHOR's start - where the cycle the reading names began - as against
	// `cycleStart` below, which is where the PREDICTED one begins. Two different
	// moments, and the rename is what made them need two different names.
	const anchorCycleStart = reading.isCommitPhase
		? reading.phaseStart
		: reading.phaseEnd - cycleDuration;
	const elapsed = now - anchorCycleStart;
	// A clock behind the reading predicts nothing; the reading stands.
	if (!(elapsed >= 0)) return reading;

	const cyclesPassed = Math.floor(elapsed / cycleDuration);
	const cycleStart = anchorCycleStart + cyclesPassed * cycleDuration;
	const inCycle = elapsed - cyclesPassed * cycleDuration;
	const isCommitPhase = inCycle < config.commitPhaseDuration;
	return {
		cycleNumber: reading.cycleNumber + cyclesPassed,
		isCommitPhase,
		phaseStart: isCommitPhase
			? cycleStart
			: cycleStart + config.commitPhaseDuration,
		phaseEnd: isCommitPhase
			? cycleStart + config.commitPhaseDuration
			: cycleStart + cycleDuration,
	};
}

/** The timings a countdown needs, from a cycle the chain has confirmed. */
export function timingsOf(
	reading: CycleReading,
	now: number,
	config: CycleConfig,
): CycleTimings {
	const cycleDuration = config.commitPhaseDuration + config.revealPhaseDuration;
	const cycleStart = reading.isCommitPhase
		? reading.phaseStart
		: reading.phaseEnd - cycleDuration;
	const timeLeftInPhase = reading.phaseEnd - now;
	const timeLeftInCycle = reading.isCommitPhase
		? timeLeftInPhase + config.revealPhaseDuration
		: timeLeftInPhase;
	return {
		timeLeftInCycle,
		timeInCurrentCycle: now - cycleStart,
		timeLeftInPhase,
		timeLeftForCommitEnd: reading.isCommitPhase ? timeLeftInPhase : 0,
		timeLeftForRevealEnd: timeLeftInCycle,
		// The window as it actually stands, which an early open WIDENS. Reporting
		// the nominal duration instead would make the dial jump backwards the
		// moment somebody advanced.
		currentPhaseDuration: reading.phaseEnd - reading.phaseStart,
		// Already open, or opening when the commit phase closes - which is the
		// LATEST it can open, and therefore the moment a scheduler should be
		// told: an early advance can only bring it forward, and a reveal that
		// turns up later than the window opened is still inside it.
		revealOpensAt: reading.isCommitPhase
			? reading.phaseEnd
			: reading.phaseStart,
	};
}

/**
 * Cycles that follow the clock, and can be brought forward by unanimity.
 *
 * THE CHAIN IS THE ANSWER AND THE CLOCK IS A PREDICTOR, which is the whole
 * shape of this policy on the client. Polling alone would show a phase up to
 * one interval late, and arithmetic alone cannot see an advance at all, so it
 * does both and publishes whichever is FURTHER ON. The prediction can only ever
 * be behind, because the only thing it cannot model is a phase opening EARLY.
 */
export function createHybridCycleTrackers(params: {
	chainTime: ChainTimeStore;
	config: CycleConfigStore;
	/** Reads the cycle from the game contract. */
	readCycle: () => Promise<CycleReading>;
	/** How often to re-read. Defaults to one second. */
	pollInterval?: number;
}): {
	cycleInfo: CycleInfoStore;
	twoPhase: Readable<TwoPhase>;
	refresh: () => Promise<void>;
} {
	const {chainTime, config, readCycle} = params;
	const pollInterval = params.pollInterval ?? 1000;

	/**
	 * The furthest-on cycle anyone has established, from either source.
	 *
	 * Kept as a floor rather than replaced, so a lagging RPC node answering for
	 * a block behind cannot walk the cycle backwards. The chain is monotone;
	 * the answers about it are not always.
	 */
	let known: CycleReading | undefined;

	const subscribers = new Set<(value: CycleInfo) => void>();
	let timer: ReturnType<typeof setInterval> | undefined;
	let published: CycleInfo | undefined;

	function infoAt(time: number): HybridCycleInfo {
		const $config = config.current;
		if (!known) {
			// Nothing has been read yet. The deployment's own grid is the best
			// floor there is, and it is exactly the timed answer - which is what
			// this policy degrades to when nobody has advanced anything.
			const timed = calculateCycleInfo(time, $config);
			return {...timed, type: 'hybrid'};
		}
		const reading = laterReading(known, predictCycle(known, time, $config));
		return {
			type: 'hybrid',
			currentCycleNumber: reading.cycleNumber,
			isCommitPhase: reading.isCommitPhase,
			...timingsOf(reading, time, $config),
			config: $config,
		};
	}

	function publish() {
		published = infoAt(chainTime.now());
		for (const run of subscribers) run(published);
	}

	async function refresh() {
		const reading = await readCycle();
		known = known ? laterReading(known, reading) : reading;
		publish();
	}

	const _clock = derived([chainTime, config], ([$chainTime]) => $chainTime);

	const cycleInfo: CycleInfoStore = {
		subscribe(run) {
			subscribers.add(run);
			run(published ?? infoAt(chainTime.now()));
			// The clock drives the countdown between reads, so the dial is smooth
			// even though the authority arrives once a second.
			const stopClock = _clock.subscribe(() => publish());
			if (typeof window !== 'undefined' && !timer) {
				void refresh();
				timer = setInterval(() => void refresh(), pollInterval);
			}
			return () => {
				subscribers.delete(run);
				stopClock();
				if (subscribers.size === 0 && timer) {
					clearInterval(timer);
					timer = undefined;
				}
			};
		},
		now: () => infoAt(chainTime.now()),
		fromTime: (time: number) => infoAt(time),
	};

	const twoPhase = derived<Readable<CycleInfo>, TwoPhase>(
		cycleInfo,
		($cycleInfo): TwoPhase => twoPhaseFrom($cycleInfo as HybridCycleInfo),
	);

	return {cycleInfo, twoPhase, refresh};
}

/**
 * Cycles that only move when the contract is told to move them.
 *
 * There is no clock to read, so the current cycle has to be polled from the
 * chain. What a game with no timer at all uses, and what local testing and
 * single-player debugging want, where waiting out a real commit phase would
 * make every test slow.
 */
export function createManualCycleTrackers(params: {
	config: CycleConfigStore;
	/** Reads (cycle, committing) from the game contract. */
	readCycleNumber: () => Promise<{cycleNumber: number; committing: boolean}>;
	/** How often to re-read. Defaults to one second. */
	pollInterval?: number;
}): {
	cycleInfo: CycleInfoStore;
	twoPhase: Readable<TwoPhase>;
	refresh: () => Promise<void>;
} {
	const {config, readCycleNumber} = params;
	const pollInterval = params.pollInterval ?? 1000;

	let $info: ManualCycleInfo = {
		type: 'manual',
		currentCycleNumber: 2,
		isCommitPhase: true,
		config: config.current,
	};

	const subscribers = new Set<(value: CycleInfo) => void>();
	let timer: ReturnType<typeof setInterval> | undefined;

	function publish() {
		for (const run of subscribers) run($info);
	}

	async function refresh() {
		const {cycleNumber, committing} = await readCycleNumber();
		if (
			cycleNumber === $info.currentCycleNumber &&
			committing === $info.isCommitPhase
		) {
			return;
		}
		$info = {
			type: 'manual',
			currentCycleNumber: cycleNumber,
			isCommitPhase: committing,
			config: config.current,
		};
		publish();
	}

	const cycleInfo: CycleInfoStore = {
		subscribe(run) {
			subscribers.add(run);
			run($info);
			// Off-browser (SSR / prerender) nothing polls: a server render must
			// not perform IO or leave a timer behind.
			if (typeof window !== 'undefined' && !timer) {
				void refresh();
				timer = setInterval(() => void refresh(), pollInterval);
			}
			return () => {
				subscribers.delete(run);
				if (subscribers.size === 0 && timer) {
					clearInterval(timer);
					timer = undefined;
				}
			};
		},
		now: () => $info,
		// A manual chain has no notion of "the cycle at time t": it is wherever
		// the contract currently says it is.
		fromTime: () => $info,
	};

	const twoPhase = derived<Readable<CycleInfo>, TwoPhase>(
		cycleInfo,
		($cycleInfo): TwoPhase => ({
			type: 'manual',
			phase: $cycleInfo.isCommitPhase ? 'play' : 'wait',
		}),
	);

	return {cycleInfo, twoPhase, refresh};
}

/**
 * The policy, in the order the contract's enum declares it.
 *
 * A number crosses the boundary because a Solidity enum is a number, so the
 * ORDER here is load-bearing in the same way the contract's is.
 */
const POLICY_BY_VALUE: readonly CyclePolicy[] = ['timed', 'manual', 'hybrid'];

/** Read the cycle configuration off the deployment's linked data. */
export function resolveCycleConfig(linkedData: {
	commitPhaseDuration: unknown;
	revealPhaseDuration: unknown;
	startTime?: unknown;
	cyclePolicy?: unknown;
}): CycleConfig {
	// READ, not coerced. `Number(undefined)` is `NaN`, and a NaN phase duration
	// makes every comparison against the clock false, so the cycle simply stops
	// advancing and nothing is ever raised: the app sits on one cycle forever
	// with no error to go on. See `./linked-data.ts`.
	const values = linkedData as DeclaredValues;
	const revealPhaseDuration = readNumber(values, 'revealPhaseDuration');
	return {
		commitPhaseDuration: readNumber(values, 'commitPhaseDuration'),
		revealPhaseDuration,
		// A deployment that declares no start time started at time zero, which is
		// a real answer rather than a guess at a missing one.
		startTime: optionalNumber(values, 'startTime') ?? 0,
		// A commit needs to land before the phase closes; the reveal phase is a
		// safe upper bound on how long that takes on these chains.
		commitTimeAllowance: revealPhaseDuration + 0.1,
		policy: resolvePolicy(values),
	};
}

/**
 * Which policy the deployment declared, or which one it had before it could.
 *
 * A DEPLOYMENT THAT DECLARES NONE IS OLDER THAN THE PARAMETER, and what it ran
 * is a fact rather than a guess: there was one rule, and it read the policy off
 * the durations - both zero meant the cycle had to be pushed, anything else
 * meant the clock decided. Reproducing that is the honest answer for such a
 * deployment, and it is the one thing here that may NOT be tidied into "assume
 * timed": a manual deployment read as timed would divide by a zero cycle and
 * put the client on a clock the chain is not running.
 *
 * It is emphatically not the reading for a NEW deployment. Declaring the policy
 * is what stopped two unrelated things sharing one derivation, and the
 * contract now refuses a configuration where the durations disagree with the
 * policy, so the two can never drift apart again.
 */
function resolvePolicy(values: DeclaredValues): CyclePolicy {
	const declared = optionalNumber(values, 'cyclePolicy');
	if (declared !== undefined) {
		const policy = POLICY_BY_VALUE[declared];
		if (!policy) {
			throw new Error(
				`The deployment declares a cyclePolicy of ${declared}, which this build does not know. ` +
					`It understands ${POLICY_BY_VALUE.join(', ')}; check the app is as new as the contract.`,
			);
		}
		return policy;
	}
	return readNumber(values, 'commitPhaseDuration') === 0 &&
		readNumber(values, 'revealPhaseDuration') === 0
		? 'manual'
		: 'timed';
}

/** A config that never changes, which is the common case. */
export function staticCycleConfig(config: CycleConfig): CycleConfigStore {
	return {
		get current() {
			return config;
		},
		subscribe(run) {
			run(config);
			return () => {};
		},
	};
}

/** Convenience for consumers that want the three-phase view. */
export function createThreePhase(
	cycleInfo: CycleInfoStore,
): Readable<ThreePhase> {
	return derived<Readable<CycleInfo>, ThreePhase>(
		cycleInfo,
		($cycleInfo): ThreePhase => {
			if ($cycleInfo.type !== 'manual') {
				return threePhaseFrom($cycleInfo);
			}
			// A manual chain has no countdown, only which phase it is in.
			const phase: ThreePhase['phase'] = $cycleInfo.isCommitPhase
				? 'play'
				: 'reveal';
			return {phase, timeLeft: 0, duration: 0};
		},
	);
}

/** Read the current cycle without subscribing. */
export function currentCycleNumberOf(store: CycleInfoStore): number {
	return get(store).currentCycleNumber;
}

/**
 * THE TRACKER THIS DEPLOYMENT'S POLICY CALLS FOR.
 *
 * One call site rather than three, because which tracker to build is not a
 * decision an app should be making: the deployment already made it, and a game
 * that picked its own would be drawing a clock the chain is not running.
 *
 * `readCycle` is only used by the policies that need it. The timed one asks the
 * chain nothing at all, which is the point of it.
 *
 * `refresh` IS PART OF THE COMMON SHAPE, and it is a no-op under `timed`
 * rather than absent. A caller that has just changed where the cycle IS - by
 * advancing it, which is a transaction (see `./advance.ts`) - should say so
 * rather than wait out a poll interval for the news, and it should be able to
 * say so without first asking which policy is running. Under `timed` there is
 * genuinely nothing to re-read: the cycle is the clock, and the clock is
 * already ticking.
 */
export function createCycleTrackers(params: {
	chainTime: ChainTimeStore;
	config: CycleConfigStore;
	readCycle: () => Promise<CycleReading>;
	pollInterval?: number;
}): {
	cycleInfo: CycleInfoStore;
	twoPhase: Readable<TwoPhase>;
	refresh: () => Promise<void>;
} {
	switch (params.config.current.policy) {
		case 'manual':
			return createManualCycleTrackers({
				config: params.config,
				pollInterval: params.pollInterval,
				readCycleNumber: async () => {
					const cycle = await params.readCycle();
					return {
						cycleNumber: cycle.cycleNumber,
						committing: cycle.isCommitPhase,
					};
				},
			});
		case 'hybrid':
			return createHybridCycleTrackers(params);
		case 'timed':
			return {...createTimedCycleTrackers(params), refresh: async () => {}};
	}
}

/**
 * Chain time, in seconds, at which the reveal phase of a cycle opens.
 *
 * The inverse of the cycle formula, and the thing a scheduler is told at commit
 * time. Read it off the cycle info (`revealOpensAt`) rather than calling this
 * directly unless the cycle you are asking about is on the deployment's
 * ORIGINAL grid: under `hybrid` an early advance re-origins it, and this
 * function has no way to know.
 */
export function revealPhaseStartTime(
	config: CycleConfig,
	cycleNumber: number,
): number {
	const cycleDuration = config.commitPhaseDuration + config.revealPhaseDuration;
	return (
		config.startTime +
		(cycleNumber - 2) * cycleDuration +
		config.commitPhaseDuration
	);
}

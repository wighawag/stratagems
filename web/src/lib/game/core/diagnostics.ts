/**
 * A running commentary on the things that flash past.
 *
 * WHY IT SUBSCRIBES RATHER THAN INSTRUMENTS, and this is the reason it is
 * framework rather than one app's helper. Everything traced here lives in
 * `core/` and `game/core/`, which a descendant inherits byte for byte, and
 * keeping it that way is what makes merging from upstream free. Sprinkling log
 * lines through those files would trade that for a permanent merge conflict in
 * every file touched, in every repo downstream, forever. Every fact below is
 * already published as a store, so watching from OUTSIDE costs nothing.
 *
 * WHAT IT IS FOR, concretely. The faults it was written for are over before
 * they can be described: a modal that appears and vanishes during a signed
 * transaction, and a "data may be stale" bar showing for a second or two. Both
 * are TRANSITIONS, not states, so the only way to catch one is to timestamp
 * every transition and read it back beside a recording.
 *
 * Each line carries `+Nms` since the previous line in its own namespace, which
 * is the number that matters when the question is "what did that modal follow?"
 * rather than "what time was it?".
 *
 * TURNING IT ON: `?debug=diag:*&debugLevel=debug`. The sharp edges are in
 * `web/README.md`: a bare `?debug` does nothing, the level defaults to warn so
 * the namespaces alone are silent, and the namespace selection persists while
 * the level does not.
 *
 * None of that machinery is here or anywhere in the app: the inline script in
 * `src/app.html` builds the factory and parses the URL before the first module
 * runs. Do NOT call `hookup()` from a module to "fix" logging that looks inert
 * - it installs a second factory over `globalThis._logFactory`, freshly
 * defaulted, silently undoing whatever the URL just asked for.
 *
 * WHERE THE SEAM IS. This watches what every app on this template has: the
 * core services, and the submission. What a GAME adds to the same trace - which
 * entity is being played, what its own flows are doing - is its own, and it
 * adds it by calling {@link watch} beside {@link startCoreDiagnostics}. See
 * `$lib/placement/diagnostics.ts`, the reference game's: a game supplies its own
 * as `startDiagnostics` through `$app-specific`.
 */
import type {Readable} from 'svelte/store';
import {logs} from 'named-logs';
import type {SubmissionState} from './submission';

/** One namespace per question, so `?debug=diag:modal` is a useful filter. */
export const DIAG = {
	/** Anything that can put a modal on screen. */
	modal: 'diag:modal',
	/** RPC health, and the polls that decide it. */
	rpc: 'diag:rpc',
	/** Dispatches, from record to settle. The silent signer's work. */
	send: 'diag:send',
	/** The commit-reveal submission and what the game does around it. */
	submission: 'diag:submission',
} as const;

/**
 * What a described value turns into: a line, nothing, or a line with a DETAIL.
 *
 * The detail is handed to the console beside the text, so an error arrives as
 * the expandable object it is rather than as `[object Object]`.
 */
export type Described = string | undefined | {line: string; detail?: unknown};

/**
 * Log a store's value whenever the part we care about changes.
 *
 * Repeats are dropped: these stores re-emit constantly - an onchain poll alone
 * fires every few seconds - and a trace that repeats itself is one nobody reads
 * to the end.
 */
export function watch<T>(
	namespace: string,
	store: Readable<T>,
	describe: (value: T) => Described,
): () => void {
	const logger = logs(namespace);
	let previous: string | undefined;
	let last = Date.now();
	let first = true;

	return store.subscribe((value) => {
		const described = describe(value);
		if (described === undefined) return;
		const line = typeof described === 'string' ? described : described.line;
		if (line === previous) return;
		const now = Date.now();
		// The first line is a baseline, not an interval.
		const gap = first ? '' : ` (+${now - last}ms)`;
		first = false;
		last = now;
		previous = line;
		if (typeof described === 'string') {
			logger.debug(`${line}${gap}`);
		} else {
			logger.debug(`${line}${gap}`, described.detail);
		}
	});
}

export const shortAddress = (a: string | undefined): string =>
	a ? `${a.slice(0, 6)}..${a.slice(-4)}` : 'none';

/**
 * The one-line version of an error, for scanning a trace.
 *
 * NOT a substitute for the error itself: plenty of failures arrive as plain
 * objects (viem's request errors, a poller's `{message, cause}`), and
 * `String()` on those prints `[object Object]` - a trace that cannot be read is
 * one nobody reads to the end. So this reaches for a `message` field when there
 * is one, and the full object is passed to the console BESIDE the line (see
 * {@link watch}) so it can be expanded.
 */
export const errorSummary = (error: unknown): string => {
	if (error instanceof Error) return error.message;
	if (typeof error === 'object' && error !== null) {
		const message = (error as {message?: unknown}).message;
		if (typeof message === 'string' && message !== '') return message;
		return Object.prototype.toString.call(error);
	}
	return String(error);
};

/** A poller's own account of itself, which is what RPC health is folded from. */
type PollStatus = Readable<{loading: boolean; error?: unknown}>;

/**
 * What this needs of an app, described STRUCTURALLY rather than as `Context`.
 *
 * `context/types.ts` is one of the files a game replaces, so naming it here
 * would make this file un-inheritable by the games it exists for. Every member
 * below is something the template composes for every app.
 */
export type DiagnosableApp = {
	balanceCheck: Readable<{step: string}>;
	inFlight: Readable<{requests: readonly unknown[]; outcomes: object}>;
	accountCannotSend: Readable<unknown>;
	confirmation: Readable<unknown>;
	errorDetails: Readable<unknown>;
	topUp: Readable<unknown>;
	rpcHealth: Readable<{healthy: boolean; error?: unknown}>;
	onchainState: {status: PollStatus};
	gasFee: {status: PollStatus};
	accountBalance: {status: PollStatus};
	signerBalance: Readable<{step: string; value?: bigint}> & {
		status: PollStatus;
	};
	account: Readable<string | undefined>;
	game: {
		submission: Readable<SubmissionState<unknown>>;
		cycleInfo: Readable<{currentCycleNumber: number; isCommitPhase: boolean}>;
	};
};

/**
 * Start watching everything the template composes for every app. Returns the
 * teardown.
 *
 * Cheap enough to run always: every subscription is to a store the app already
 * keeps live, and `logs()` returns no-ops for a namespace nobody enabled. It is
 * still gated by the caller, because a subscription that exists only to be
 * discarded is still a subscription.
 */
export function startCoreDiagnostics(app: DiagnosableApp): () => void {
	const stops: Array<() => void> = [];

	// ---- what can put a modal on screen ------------------------------------
	//
	// Listed together on purpose. The complaint is "a modal flashed", and the
	// first question is WHICH, so every candidate reports in one namespace and
	// the trace answers it by elimination.

	stops.push(
		// `estimating` is the one that opens a modal titled "Preparing
		// Transaction" for the duration of a balance check. Moves deliberately do
		// not go through this, so seeing it around a commit would itself be the
		// finding.
		watch(
			DIAG.modal,
			app.balanceCheck,
			($check) => `balanceCheck: ${$check.step}`,
		),
	);

	stops.push(
		watch(DIAG.modal, app.inFlight, ($inFlight) => {
			const requests = $inFlight.requests.length;
			const outcomes = Object.keys($inFlight.outcomes).length;
			// A request with NO outcome is silent by design; one WITH an outcome is
			// what opens the in-flight modal. Both are reported so the trace shows
			// the moment a silent record becomes a reported one.
			return `inFlight: ${requests} request(s), ${outcomes} reconciled`;
		}),
	);

	stops.push(
		watch(
			DIAG.modal,
			app.accountCannotSend,
			($state) => `accountCannotSend: ${JSON.stringify($state)}`,
		),
	);

	stops.push(
		watch(
			DIAG.modal,
			app.confirmation,
			($state) => `confirmation: ${JSON.stringify($state)}`,
		),
	);

	stops.push(
		watch(
			DIAG.modal,
			app.errorDetails,
			// The details modal carries a whole transaction error, so this reports
			// only whether it is up.
			($state) => `errorDetails: ${$state ? 'shown' : 'hidden'}`,
		),
	);

	stops.push(
		watch(
			DIAG.modal,
			app.topUp,
			($flow) => `topUp: ${($flow as {phase?: string}).phase ?? 'unknown'}`,
		),
	);

	// ---- the stale-data bar -------------------------------------------------
	//
	// Health takes the most recent SETTLED outcome across its inputs with no
	// tolerance for a single failure, so one blip raises the bar until the next
	// success settles. The bar itself only shows a category, so the error is
	// logged in full here: that is the bit needed to tell a real outage from the
	// node being momentarily behind.

	stops.push(
		watch(DIAG.rpc, app.rpcHealth, ($health) =>
			$health.healthy
				? 'healthy'
				: {
						line: `UNHEALTHY: ${
							$health.error ? errorSummary($health.error) : 'no error given'
						}`,
						// The whole error, as an object the console can expand: the
						// summary above is for scanning, and `String()` on a plain
						// object is how this line used to read `[object Object]`.
						detail: $health.error,
					},
		),
	);

	// The inputs health folds together. Logged separately because the bar cannot
	// say WHICH one failed, and that is the whole question: a failing gas poll
	// and a failing board read mean different things and have different
	// remedies.
	const pollers: Array<[string, PollStatus]> = [
		['onchainState', app.onchainState.status],
		['gasFee', app.gasFee.status],
		['accountBalance', app.accountBalance.status],
		['signerBalance', app.signerBalance.status],
	];
	for (const [name, status] of pollers) {
		stops.push(
			watch(DIAG.rpc, status, ($status) =>
				$status.error
					? {
							line: `${name}: ERROR ${errorSummary($status.error)}`,
							detail: $status.error,
						}
					: $status.loading
						? undefined // loading is noise; only settled outcomes decide health
						: `${name}: ok`,
			),
		);
	}

	// ---- the silent signer's transactions -----------------------------------

	stops.push(
		watch(DIAG.send, app.signerBalance, ($balance) =>
			$balance.step === 'Loaded'
				? `signer balance: ${$balance.value}`
				: `signer balance: ${$balance.step}`,
		),
	);

	// ---- the submission -----------------------------------------------------
	//
	// Here rather than as log lines inside the submission because it is the one
	// thing every other trace has to be lined up against: a modal at +200ms means
	// nothing until you know a commit went out at +0.

	stops.push(
		watch(DIAG.submission, app.game.submission, ($submission) => {
			const step = $submission.step;
			if (step === 'Error') {
				return `submission: Error during ${$submission.during}: ${$submission.message}`;
			}
			const actions = 'actions' in $submission ? $submission.actions.length : 0;
			// An EMPTY committed submission is the liveness commit (see
			// `commitWhenIdle`), and telling it apart from a real turn matters when
			// reading a trace.
			return `submission: ${step}${
				'cycleNumber' in $submission ? ` cycle=${$submission.cycleNumber}` : ''
			} actions=${actions}`;
		}),
	);

	stops.push(
		watch(
			DIAG.submission,
			app.game.cycleInfo,
			($cycle) =>
				`cycle ${$cycle.currentCycleNumber} ${
					$cycle.isCommitPhase ? 'commit' : 'reveal'
				}`,
		),
	);

	stops.push(
		watch(
			DIAG.submission,
			app.account,
			($account) => `account: ${shortAddress($account)}`,
		),
	);

	return () => {
		for (const stop of stops) stop();
	};
}

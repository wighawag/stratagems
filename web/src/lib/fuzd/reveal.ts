/**
 * THE SCHEDULED REVEAL AS A GAME SHOWS IT: which turn is scheduled, what fuzd
 * says about it in the reveal phase, and the one thing the browser does with
 * that answer (P7): a failure reported by fuzd makes this browser reveal at
 * once instead of waiting for its fallback point.
 *
 * Read from what the submission stored with the turn (`revealScheduled`, and
 * the layer's `extensions.fuzd`), so it survives a reload: a page opened after
 * the commit, on the turn's own cycle, shows the same line.
 */
import {derived, type Readable} from 'svelte/store';
import type {
	SubmissionState,
	SubmissionStorage,
} from '$lib/game/core/submission';
import {storedTurnsFor} from '$lib/game/core/commit-reveal/storage';
import {scheduleOf, type FuzdExtensions, type FuzdSchedule} from './schedule';
import {createFuzdStatus, type FuzdStatus} from './status';

/** The turn in hand, as far as its scheduling goes. */
export type ScheduledTurn = {
	cycleNumber: number;
	/** As the submission recorded it: absent without a scheduler. */
	revealScheduled?: boolean;
	/** What was handed to fuzd, when it was. */
	schedule?: FuzdSchedule;
};

/** `ScheduledTurn` with fuzd's word on it, in the reveal phase. */
export type ScheduledReveal = ScheduledTurn & {status?: FuzdStatus};

const WITH_A_TURN = new Set(['Committed', 'Revealing', 'Revealed']);

/**
 * The committed turn's scheduling, from the submission's state and the record
 * stored with it. Undefined while there is no committed turn.
 */
export function scheduledTurn<TIdentity, TAction>(params: {
	identity: Readable<TIdentity | undefined>;
	submission: Readable<SubmissionState<TAction>>;
	storageFor: (
		identity: TIdentity,
	) => SubmissionStorage<TAction, FuzdExtensions>;
}): Readable<ScheduledTurn | undefined> {
	return derived(
		[params.identity, params.submission],
		([$identity, $submission]): ScheduledTurn | undefined => {
			if ($identity === undefined || !WITH_A_TURN.has($submission.step)) {
				return undefined;
			}
			const cycleNumber = ($submission as {cycleNumber: number}).cycleNumber;
			const turns = storedTurnsFor(params.storageFor($identity), cycleNumber);
			const recorded = turns.find((t) => t.revealScheduled !== undefined);
			const revealScheduled =
				$submission.step === 'Committed' &&
				$submission.revealScheduled !== undefined
					? $submission.revealScheduled
					: recorded?.revealScheduled;
			const schedule = scheduleOf(turns);
			return {
				cycleNumber,
				...(revealScheduled === undefined ? {} : {revealScheduled}),
				...(schedule ? {schedule} : {}),
			};
		},
	);
}

/**
 * The scheduled turn with fuzd's status, polled in the reveal phase of the
 * turn's own cycle.
 */
export function createScheduledReveal(params: {
	turn: Readable<ScheduledTurn | undefined>;
	cycleInfo: Readable<{currentCycleNumber: number; isCommitPhase: boolean}>;
	endpoint: () => string | undefined;
	intervalMs?: number;
	read?: Parameters<typeof createFuzdStatus>[0]['read'];
}): Readable<ScheduledReveal | undefined> {
	// A new reading of the same schedule restarts nothing: the status poller
	// keys on the slot and the signing account.
	const schedule = derived(params.turn, ($turn) => $turn?.schedule);
	const active = derived(
		[params.turn, params.cycleInfo],
		([$turn, $info]) =>
			!!$turn?.schedule &&
			$info.currentCycleNumber === $turn.cycleNumber &&
			!$info.isCommitPhase,
	);
	const status = createFuzdStatus({
		endpoint: params.endpoint,
		schedule,
		active,
		...(params.intervalMs ? {intervalMs: params.intervalMs} : {}),
		...(params.read ? {read: params.read} : {}),
	});
	return derived([params.turn, status], ([$turn, $status]) =>
		$turn
			? {...$turn, ...($turn.schedule && $status ? {status: $status} : {})}
			: undefined,
	);
}

/**
 * Reveal from this browser AT ONCE when fuzd reports that it will not (P7),
 * rather than at the fallback point: nobody else is coming. Only while the
 * turn is still `Committed` in its own cycle; `unreachable` is not a failure.
 * Returns the teardown.
 */
export function revealOnScheduleFailure<TAction>(params: {
	reveal: Readable<ScheduledReveal | undefined>;
	submission: Readable<SubmissionState<TAction>> & {reveal(): Promise<void>};
}): () => void {
	let asked: number | undefined;
	return derived(
		[params.reveal, params.submission],
		(values) => values,
	).subscribe(([$reveal, $submission]) => {
		if (
			$reveal?.status?.step !== 'failed' ||
			$submission.step !== 'Committed' ||
			$submission.cycleNumber !== $reveal.cycleNumber ||
			asked === $reveal.cycleNumber
		) {
			return;
		}
		asked = $reveal.cycleNumber;
		void params.submission.reveal();
	});
}

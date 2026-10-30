/**
 * WHAT FUZD SAYS ABOUT A SCHEDULED REVEAL, read from the record the scheduler
 * stored with the turn (`extensions.fuzd`), in the reveal phase (P8 c).
 *
 * Two routes answer it, both keyed by the SIGNING account and the slot:
 *
 * - `GET /api/scheduling/scheduledExecution/:chainId/:account/:slot`: the
 *   schedule while fuzd still holds it (gone once archived: expired, or a
 *   payload it could not decrypt);
 * - `GET /api/execution/execution/:chainId/:account/:slot/:batchIndex`: each
 *   transaction of the batch, once broadcast (its hash), then `finalized`, with
 *   `lastError` `FAILED` or `REPLACED` when it did not do what it was for.
 *
 * FAILED AND UNREACHABLE ARE DIFFERENT ANSWERS, on purpose. `failed` is fuzd
 * saying the reveal will not happen (it reverted, or fuzd no longer holds the
 * schedule), and the browser then reveals at once (P7). `unreachable` is this
 * browser not being able to ask, which says nothing about the reveal: fuzd may
 * be sending it right now, so the browser keeps to its fallback point rather
 * than racing it.
 */
import {readable, type Readable} from 'svelte/store';
import type {FuzdSchedule} from './schedule';

export type FuzdStatus =
	/** fuzd holds the schedule; nothing broadcast yet. */
	| {step: 'scheduled'}
	/** Some of the batch is broadcast, none finalised as failed. */
	| {step: 'broadcast'; sent: number; total: number}
	/** Every transaction of the batch broadcast and final. */
	| {step: 'confirmed'}
	/** fuzd will not reveal this turn. */
	| {step: 'failed'; reason: string}
	/** fuzd could not be asked. */
	| {step: 'unreachable'};

/** The parts of fuzd's records this reader looks at. */
type QueuedExecution = {broadcasted?: boolean; finalized?: boolean};
type PendingExecution = {
	hash?: string;
	finalized?: boolean;
	isVoidTransaction?: boolean;
	lastError?: string;
};

export type FetchLike = (
	url: string,
	init?: {signal?: AbortSignal},
) => Promise<{ok: boolean; json(): Promise<unknown>}>;

async function getJSON<T>(
	fetchFn: FetchLike,
	url: string,
	timeoutMs: number,
): Promise<T | undefined> {
	const response = await fetchFn(url, {signal: AbortSignal.timeout(timeoutMs)});
	if (!response.ok) throw new Error(`${url}: not ok`);
	const body = (await response.json()) as {
		success?: boolean;
		execution?: T;
	};
	if (!body || body.success !== true) throw new Error(`${url}: not a success`);
	return body.execution;
}

/** One reading of a schedule's state. Never throws: see `unreachable`. */
export async function readFuzdStatus(params: {
	endpoint: string;
	schedule: FuzdSchedule;
	fetch?: FetchLike;
	timeoutMs?: number;
}): Promise<FuzdStatus> {
	const {schedule} = params;
	const fetchFn = params.fetch ?? (globalThis.fetch as unknown as FetchLike);
	const timeoutMs = params.timeoutMs ?? 5_000;
	const base = params.endpoint.replace(/\/+$/, '');
	const id = `${schedule.chainId}/${schedule.account}/${schedule.slot}`;
	try {
		const [queued, ...executions] = await Promise.all([
			getJSON<QueuedExecution>(
				fetchFn,
				`${base}/api/scheduling/scheduledExecution/${id}`,
				timeoutMs,
			),
			...Array.from({length: schedule.batchSize}, (_, index) =>
				getJSON<PendingExecution>(
					fetchFn,
					`${base}/api/execution/execution/${id}/${index}`,
					timeoutMs,
				),
			),
		]);
		const sent = executions.filter((e) => e?.hash);
		const failed = sent.find(
			(e) =>
				e?.isVoidTransaction ||
				e?.lastError === 'FAILED' ||
				e?.lastError === 'REPLACED',
		);
		if (failed) {
			return {
				step: 'failed',
				reason: failed.isVoidTransaction
					? 'the reveal was voided'
					: `a reveal transaction ${failed.lastError === 'REPLACED' ? 'was replaced' : 'failed'}`,
			};
		}
		if (sent.length === schedule.batchSize && sent.every((e) => e?.finalized)) {
			return {step: 'confirmed'};
		}
		if (sent.length > 0 || queued?.broadcasted) {
			return {step: 'broadcast', sent: sent.length, total: schedule.batchSize};
		}
		if (queued) return {step: 'scheduled'};
		return {
			step: 'failed',
			reason: 'the reveal service no longer holds this turn',
		};
	} catch {
		return {step: 'unreachable'};
	}
}

/** No more news will come from these. */
export function isFinal(status: FuzdStatus | undefined): boolean {
	return status?.step === 'confirmed' || status?.step === 'failed';
}

/**
 * The status of `schedule`, polled while `active` (the reveal phase of its
 * cycle) and kept once it is final or the phase is over. Undefined until the
 * first reading, and again whenever the schedule changes.
 */
export function createFuzdStatus(params: {
	endpoint: () => string | undefined;
	schedule: Readable<FuzdSchedule | undefined>;
	active: Readable<boolean>;
	intervalMs?: number;
	read?: typeof readFuzdStatus;
}): Readable<FuzdStatus | undefined> {
	const intervalMs = params.intervalMs ?? 2_000;
	const read = params.read ?? readFuzdStatus;

	return readable<FuzdStatus | undefined>(undefined, (set) => {
		let schedule: FuzdSchedule | undefined;
		let active = false;
		let status: FuzdStatus | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let generation = 0;

		function stop() {
			if (timer) clearTimeout(timer);
			timer = undefined;
		}

		async function poll(startedIn: number) {
			const endpoint = params.endpoint();
			if (!schedule || !endpoint) return;
			const next = await read({endpoint, schedule});
			if (startedIn !== generation) return;
			status = next;
			set(status);
			if (active && !isFinal(status)) {
				timer = setTimeout(() => void poll(startedIn), intervalMs);
			}
		}

		function update() {
			stop();
			generation++;
			if (active && schedule && !isFinal(status)) void poll(generation);
		}

		const unsubscribeSchedule = params.schedule.subscribe(($schedule) => {
			if (
				$schedule?.slot === schedule?.slot &&
				$schedule?.account === schedule?.account
			) {
				schedule = $schedule;
				return;
			}
			schedule = $schedule;
			status = undefined;
			set(undefined);
			update();
		});
		const unsubscribeActive = params.active.subscribe(($active) => {
			if ($active === active) return;
			active = $active;
			update();
		});

		return () => {
			generation++;
			stop();
			unsubscribeSchedule();
			unsubscribeActive();
		};
	});
}

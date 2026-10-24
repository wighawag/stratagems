import {describe, expect, it, vi} from 'vitest';
import {get, writable, type Readable} from 'svelte/store';
import {
	createSubmission,
	type SubmissionState,
	type SubmissionStorage,
} from '$lib/game/core/submission';
import {
	calculateCycleInfo,
	type CycleConfig,
	type CycleInfo,
	type CycleInfoStore,
} from '$lib/game/core/cycle';
import type {CommitRevealAdapter} from '$lib/game/core/seams';

const config: CycleConfig = {
	commitPhaseDuration: 40,
	revealPhaseDuration: 4,
	startTime: 0,
	commitTimeAllowance: 4.1,
	policy: 'timed',
};

/**
 * A cycle store driven by a clock the test moves by hand.
 *
 * `policy` is a parameter because the submission must behave the same under
 * every policy that HAS a clock. It used to be assumed: two of the submission's
 * automatic behaviours tested `type === 'timed'` rather than asking whether
 * there was a clock, so a deployment on the hybrid policy silently lost both -
 * including the fallback reveal, which exists to protect the stake.
 */
function fakeCycles(initialTime: number, policy: 'timed' | 'hybrid' = 'timed') {
	const time = writable(initialTime);
	let $time = initialTime;
	time.subscribe((t) => ($time = t));

	const infoAt = (t: number): CycleInfo => {
		const timed = calculateCycleInfo(t, config);
		return policy === 'timed' ? timed : {...timed, type: 'hybrid'};
	};

	const store: CycleInfoStore = {
		subscribe(run) {
			return time.subscribe((t) => run(infoAt(t)));
		},
		now: () => infoAt($time),
		fromTime: (t: number) => infoAt(t),
	};
	return {cycleInfo: store, setTime: (t: number) => time.set(t)};
}

function fakeStorage<TAction>(): SubmissionStorage<TAction> & {
	readonly current: unknown;
} {
	let stored: ReturnType<SubmissionStorage<TAction>['load']>;
	return {
		get current() {
			return stored;
		},
		load: () => stored,
		save: (submission) => {
			stored = submission;
		},
		clear: () => {
			stored = undefined;
		},
	};
}

type Action = {cellID: bigint};

function fakeAdapter(overrides?: {
	commit?: () => Promise<{hash: `0x${string}`}>;
	reveal?: () => Promise<{hash: `0x${string}`}>;
}) {
	const calls = {commit: [] as unknown[], reveal: [] as unknown[]};
	const adapter: CommitRevealAdapter<`0x${string}`, Action> = {
		buildCommitment: ({secret}) => ({
			hash: `0xhash${secret.slice(2, 6)}` as `0x${string}`,
			encoded: '0x' as `0x${string}`,
		}),
		commit: async (params) => {
			calls.commit.push(params);
			return overrides?.commit
				? overrides.commit()
				: {hash: '0xcommit' as `0x${string}`};
		},
		reveal: async (params) => {
			calls.reveal.push(params);
			return overrides?.reveal
				? overrides.reveal()
				: {hash: '0xreveal' as `0x${string}`};
		},
	};
	return {adapter, calls};
}

const player = '0x1111111111111111111111111111111111111111' as const;
const identity: Readable<`0x${string}` | undefined> = writable(player);

describe('the commit-reveal submission', () => {
	it('plans, commits and reveals across the phases of one cycle', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 42n}]);
		expect(submission.value.step).toBe('Planning');

		await submission.commit();
		expect(calls.commit).toHaveLength(1);
		expect(submission.value.step).toBe('Committed');

		// The actions come along to the commit, not just the hash: a game whose
		// stake is proportional to what was planned (this template bonds the exact
		// placement cost) cannot recover them from the hash.
		expect(calls.commit[0]).toMatchObject({
			identity: player,
			actions: [{cellID: 42n}],
		});

		// Into the reveal phase of the SAME cycle.
		setTime(41);
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		await vi.waitFor(() => expect(submission.value.step).toBe('Revealed'));

		// The reveal carried the actions and the secret that were committed to.
		expect(calls.reveal[0]).toMatchObject({
			identity: player,
			actions: [{cellID: 42n}],
		});
		stop();
	});

	it('reports how far a reveal that takes several transactions has got', async () => {
		// A REVEAL IS ONE CALL AND NOT NECESSARILY ONE TRANSACTION. Where a turn is
		// bigger than a transaction the game opens it in pieces, and the player is
		// owed an account of that: a board filling in a few cells at a time over
		// half a minute reads as a fault otherwise. The framework carries the count
		// rather than each game inventing a state for it.
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();

		const seen: (SubmissionState<Action> & {step: 'Revealing'})[] = [];
		let release: (() => void) | undefined;
		const {adapter} = fakeAdapter();
		const chunked: typeof adapter = {
			...adapter,
			reveal: async ({onProgress}) => {
				onProgress?.({done: 0, total: 3});
				onProgress?.({done: 1, total: 3});
				await new Promise<void>((resolve) => (release = resolve));
				onProgress?.({done: 3, total: 3});
				return {hash: '0xreveal' as `0x${string}`};
			},
		};

		const submission = createSubmission({
			cycleInfo,
			adapter: chunked,
			storage,
			identity,
		});
		const stop = submission.subscribe((state) => {
			if (state.step === 'Revealing') seen.push(state);
		});
		const stopCycle = submission.start();

		submission.plan([{cellID: 42n}]);
		await submission.commit();
		setTime(41);

		await vi.waitFor(() => expect(release).toBeDefined());
		// Two reports so far, and the submission is still Revealing: the state the
		// HUD reads while a long turn is going out.
		expect(seen.map((s) => s.progress)).toEqual([
			undefined,
			{done: 0, total: 3},
			{done: 1, total: 3},
		]);
		// The actions are still there beside the count, so nothing that switches on
		// `Revealing` has to learn a new shape.
		expect(seen[2].actions).toEqual([{cellID: 42n}]);

		release?.();
		await vi.waitFor(() => expect(submission.value.step).toBe('Revealed'));

		stop();
		stopCycle();
	});

	it('does not write progress over a submission the cycle has already missed', async () => {
		// The report arrives from inside an await. A cycle that turned over
		// meanwhile has already moved this submission to `Missed`, and putting a
		// `Revealing` back over that would tell the player their turn was still
		// going out when the window had shut - which is the one thing they might
		// still have acted on.
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();

		let report: ((p: {done: number; total: number}) => void) | undefined;
		let release: (() => void) | undefined;
		const {adapter} = fakeAdapter();
		const chunked: typeof adapter = {
			...adapter,
			reveal: async ({onProgress}) => {
				report = onProgress;
				await new Promise<void>((resolve) => (release = resolve));
				return {hash: '0xreveal' as `0x${string}`};
			},
		};

		const submission = createSubmission({
			cycleInfo,
			adapter: chunked,
			storage,
			identity,
		});
		const stopCycle = submission.start();

		submission.plan([{cellID: 42n}]);
		await submission.commit();
		setTime(41);
		await vi.waitFor(() => expect(report).toBeDefined());

		// The cycle turns over while the reveal is mid-flight.
		setTime(41 + 40);
		await vi.waitFor(() => expect(submission.value.step).toBe('Missed'));

		report?.({done: 2, total: 3});
		expect(submission.value.step).toBe('Missed');

		release?.();
		stopCycle();
	});

	it('tells a scheduler when the reveal is due, off the CYCLE', async () => {
		// FOUND BY MUTATION. `revealDueAt` used to be recomputed here from the
		// deployment's start time, which agrees with the cycle on a purely timed
		// chain and is why nothing noticed. Under a policy where unanimity can
		// bring a phase forward, an early advance re-origins the cycle, so the
		// recomputed answer is for a grid the chain has left behind - and a
		// scheduled reveal is the one thing that cannot be asked again later:
		// what it costs to aim it at the wrong moment is the stake.
		const reAnchored = {
			...calculateCycleInfo(0, config),
			// The cycle began later than the deployment's grid implies, so its
			// reveal opens later too.
			revealOpensAt: 1_234,
		};
		const cycleInfo: CycleInfoStore = {
			subscribe: writable<CycleInfo>(reAnchored).subscribe,
			now: () => reAnchored,
			fromTime: () => reAnchored,
		};
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage: fakeStorage<Action>(),
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 7n}]);
		await submission.commit();
		expect(calls.commit[0]).toMatchObject({revealDueAt: 1_234});
		stop();
	});

	it('persists the secret BEFORE the commitment is sent', async () => {
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		let storedWhenCommitCalled: unknown;
		const {adapter} = fakeAdapter({
			commit: async () => {
				storedWhenCommitCalled = storage.current;
				return {hash: '0xcommit'};
			},
		});
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 7n}]);
		await submission.commit();

		// A reload during the wallet prompt must still be able to reveal, so the
		// secret has to be on disk by the time the call goes out.
		expect(storedWhenCommitCalled).toMatchObject({
			cycleNumber: 2,
			actions: [{cellID: 7n}],
		});
		expect((storedWhenCommitCalled as {secret: string}).secret).toMatch(
			/^0x[0-9a-f]{64}$/,
		);
		stop();
	});

	it('reveals a commitment made before a reload', async () => {
		const storage = fakeStorage<Action>();
		storage.save({
			cycleNumber: 2,
			actions: [{cellID: 9n}],
			secret: `0x${'ab'.repeat(32)}`,
			committed: true,
		});

		// The page loads part-way through the reveal phase: there is no phase
		// TRANSITION to observe, only the standing fact that a reveal is owed.
		const {cycleInfo} = fakeCycles(42);
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		expect(calls.reveal[0]).toMatchObject({actions: [{cellID: 9n}]});
		stop();
	});

	it('keeps the secret when a reveal fails, so it can be retried', async () => {
		const storage = fakeStorage<Action>();
		storage.save({
			cycleNumber: 2,
			actions: [{cellID: 9n}],
			secret: `0x${'cd'.repeat(32)}`,
			committed: true,
		});
		const {cycleInfo} = fakeCycles(42);
		let attempts = 0;
		const {adapter} = fakeAdapter({
			reveal: async () => {
				attempts++;
				if (attempts === 1) throw new Error('user rejected');
				return {hash: '0xreveal'};
			},
		});
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		await vi.waitFor(() => expect(submission.value.step).toBe('Error'));
		// Dropping the secret here would forfeit the stake over a mis-click.
		expect(storage.current).toBeDefined();

		await submission.reveal();
		expect(submission.value.step).toBe('Revealed');
		expect(storage.current).toBeUndefined();
		stop();
	});

	it('reports a commitment the cycle moved past as missed', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		// A reveal that never lands, so the submission stays open into the next
		// cycle.
		const {adapter} = fakeAdapter({
			reveal: () => new Promise(() => {}),
		});
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();
		expect(submission.value.step).toBe('Committed');

		setTime(44); // next cycle's commit phase
		expect(submission.value.step).toBe('Missed');
		expect(storage.current).toBeUndefined();
		stop();
	});

	it('drops an uncommitted plan when the cycle turns over', () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			autoCommit: false,
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		setTime(44);

		// Nothing was at stake, so this is an expiry rather than a loss.
		expect(submission.value.step).toBe('Idle');
		expect(calls.commit).toHaveLength(0);
		stop();
	});

	it('commits and reveals automatically under EVERY clocked policy', async () => {
		// FOUND BY REVIEW, and it is the shape of defect a type system does not
		// see: adding a third member to the policy union left two behaviours
		// asking `type === 'timed'`, which narrows perfectly well and is the
		// wrong question. On a hybrid deployment auto-commit never fired and
		// the fallback reveal never fired, so a game whose stake decays with
		// silence forfeited it while the app sat there looking correct.
		const {cycleInfo, setTime} = fakeCycles(0, 'hybrid');
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage: fakeStorage<Action>(),
			identity,
			autoReveal: 'fallback',
		});
		const stop = submission.start();

		submission.plan([{cellID: 9n}]);
		setTime(37); // inside the commit-time allowance
		await vi.waitFor(() => expect(calls.commit).toHaveLength(1));

		setTime(43); // most of the reveal phase gone, so the fallback owes one
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		stop();
	});

	it('commits automatically as the commit phase closes', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 5n}]);
		setTime(20); // mid commit phase, still playable
		expect(calls.commit).toHaveLength(0);

		// Inside commitTimeAllowance of the phase closing.
		setTime(37);
		await vi.waitFor(() => expect(calls.commit).toHaveLength(1));
		stop();
	});

	it('ignores changes to the plan once the commitment is out', async () => {
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();
		submission.plan([{cellID: 2n}]);

		// The hash is of the first set; a reveal of anything else cannot open it.
		expect(submission.value).toMatchObject({
			step: 'Committed',
			actions: [{cellID: 1n}],
		});
		stop();
	});

	it('tells makeSecret WHO is committing, not only when', async () => {
		// A derivation that sees only the cycle produces one secret for every
		// identity an account holds, and a secret shared between two identities
		// lets either open the other's commitment by enumerating a small action
		// space against the published hash. So the identity has to reach the
		// derivation, and nothing else in this suite would notice if it stopped:
		// checked by removing it, which passed all sixteen other tests.
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = fakeAdapter();
		const seen: {cycleNumber: number; identity: `0x${string}`}[] = [];
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			makeSecret: async (params) => {
				seen.push(params);
				return `0x${'ab'.repeat(32)}` as `0x${string}`;
			},
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();

		expect(seen).toEqual([{cycleNumber: 2, identity: player}]);
		stop();
	});

	it('plays for a token identity of ZERO, which is falsy but real', async () => {
		// `PlayerIdentity` is `bigint | 0x${string}`, and the bigint half has a
		// value that JavaScript calls false: `0n`. The commit and reveal paths both
		// ask whether there is an identity at all before they do anything, and a
		// truthiness test there is correct for every address and wrong for exactly
		// one token id.
		//
		// The failure it produces has no symptom: token zero's turns are silently
		// never sent, nothing is logged, and every other player works. This is the
		// half of the identity refactor that is not a rename - the moment the
		// identity stops being guaranteed to be an address, `if (!player)` stops
		// meaning what it says.
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const calls = {commit: [] as unknown[], reveal: [] as unknown[]};
		const adapter: CommitRevealAdapter<bigint, Action> = {
			buildCommitment: () => ({hash: '0xhash', encoded: '0x'}),
			commit: async (params) => {
				calls.commit.push(params);
				return {hash: '0xcommit'};
			},
			reveal: async (params) => {
				calls.reveal.push(params);
				return {hash: '0xreveal'};
			},
		};
		const submission = createSubmission<bigint, Action>({
			cycleInfo,
			adapter,
			storage,
			identity: writable(0n),
		});
		const stop = submission.start();

		submission.plan([{cellID: 7n}]);
		await submission.commit();
		expect(calls.commit).toHaveLength(1);
		expect(calls.commit[0]).toMatchObject({identity: 0n});

		// And the reveal, which asks the same question again in its own function.
		setTime(41);
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		expect(calls.reveal[0]).toMatchObject({identity: 0n});
		stop();
	});

	it('lets a game DERIVE the secret instead of randomising it', async () => {
		// reveal-or-die, bomber-world and stratagems all derive the secret from a
		// signature over the cycle, so that it can be recomputed on another device
		// rather than existing only in this browser's storage.
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			makeSecret: async ({cycleNumber}) =>
				`0x${cycleNumber.toString(16).padStart(64, '0')}` as `0x${string}`,
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();

		expect((calls.commit[0] as {secret: string}).secret).toBe(
			`0x${(2).toString(16).padStart(64, '0')}`,
		);
		stop();
	});

	it('hands the secret and the reveal time to commit, for a scheduled reveal', async () => {
		// Stratagems and catacombs do not reveal from the browser: at commit time
		// they hand a timelock-encrypted reveal transaction to a scheduler, so an
		// offline player still reveals. That is only possible if commit sees the
		// secret and knows when the reveal becomes due.
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();

		const sent = calls.commit[0] as {
			secret: string;
			cycleNumber: number;
			revealDueAt?: number;
		};
		expect(sent.cycleNumber).toBe(2);
		expect(sent.secret).toMatch(/^0x[0-9a-f]{64}$/);
		// Cycle 2 starts at t=0, so its reveal phase opens once the 40s commit
		// phase is over.
		expect(sent.revealDueAt).toBe(40);
		stop();
	});

	it('leaves the reveal to a scheduler, but the player can still do it', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			autoReveal: 'never',
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();
		setTime(41); // reveal phase

		await new Promise((r) => setTimeout(r, 50));
		expect(calls.reveal).toHaveLength(0);
		expect(submission.value.step).toBe('Committed');

		// Revealing is never taken away from the player, whatever else is
		// arranged to do it for them.
		await submission.reveal();
		expect(calls.reveal).toHaveLength(1);
		stop();
	});

	it('falls back to revealing itself when the scheduler has not delivered', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			autoReveal: 'fallback',
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();

		// Early in the reveal phase: whatever was supposed to reveal still has
		// time, so stay out of its way.
		setTime(41);
		await new Promise((r) => setTimeout(r, 30));
		expect(calls.reveal).toHaveLength(0);

		// Most of the phase gone and the submission is still open: try anyway. A
		// duplicate reveal costs one reverted transaction; a missed one costs the
		// stake.
		setTime(43);
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		stop();
	});

	it('refreshes the board BEFORE reporting the reveal as done', async () => {
		// The planned placements are drawn from the submission and the confirmed ones
		// from the board. Reporting Revealed first would clear the planned overlay
		// while the board was still a fetch behind, and the player would watch
		// their own moves vanish and then reappear.
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = fakeAdapter();
		const order: string[] = [];
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			onSettled: async () => {
				order.push(`refresh:${submission.value.step}`);
				await new Promise((r) => setTimeout(r, 10));
				order.push('refreshed');
			},
		});
		const stop = submission.start();
		const unsubscribe = submission.subscribe(($r) => {
			if ($r.step === 'Revealed') order.push('Revealed');
		});

		submission.plan([{cellID: 1n}]);
		await submission.commit();
		setTime(41);
		await vi.waitFor(() => expect(order).toContain('Revealed'));

		expect(order).toEqual(['refresh:Revealing', 'refreshed', 'Revealed']);
		unsubscribe();
		stop();
	});

	it('keeps a plan made during the reveal phase, for the next cycle', async () => {
		// Clicking while the submission resolves is planning ahead, not a mistake.
		// The plan used to be stamped with the CURRENT cycle and then dropped as
		// stale the instant the cycle turned over, so the moves silently disappeared.
		const {cycleInfo, setTime} = fakeCycles(41); // reveal phase of cycle 2
		const storage = fakeStorage<Action>();
		const {adapter} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 7n}]);
		expect(submission.value).toMatchObject({step: 'Planning', cycleNumber: 3});

		// Into the commit phase of cycle 3: the plan is now current, not stale.
		setTime(44);
		expect(submission.value).toMatchObject({
			step: 'Planning',
			cycleNumber: 3,
			actions: [{cellID: 7n}],
		});

		// Still cycle 3 at t=87 (44 + 43), so it is still live.
		setTime(87);
		expect(submission.value.step).toBe('Planning');

		// It only expires once its own cycle has gone by: cycle 4 starts at 88.
		setTime(88);
		expect(submission.value.step).toBe('Idle');
		stop();
	});

	it('carries the cause of a failure, not just its wording', async () => {
		// The game classifies failures to decide what to offer: a signer with no
		// gas can be topped up and the move retried, a reverted commitment cannot.
		// Matching on the message would work until someone reworded it.
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const cause = new Error('insufficient funds for gas * price + value');
		const {adapter} = fakeAdapter({
			commit: async () => {
				throw cause;
			},
		});
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();

		expect(submission.value).toMatchObject({step: 'Error', during: 'commit'});
		expect((submission.value as {error: unknown}).error).toBe(cause);
		stop();
	});

	it('does nothing without a player', async () => {
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity: writable(undefined),
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		await submission.commit();
		expect(calls.commit).toHaveLength(0);
		expect(get(submission).step).toBe('Planning');
		stop();
	});
});

describe('a game where silence costs the player their stake', () => {
	/**
	 * `commitWhenIdle` exists for a game whose stake DECAYS rather than sitting
	 * in a bond. The shape, taken from the game on this template that has one:
	 * the contract forces the player to continuously commit and reveal, and
	 * zeroes what they hold once their last revealed cycle falls more than a
	 * configured number of misses behind. That counter advances only on a REVEAL,
	 * so a player who watches a few cycles without moving loses what they paid
	 * for, having done nothing wrong.
	 *
	 * The submission cannot be driven into this from outside: `plan([])` means
	 * "nothing is pending" and lands on Idle, so without an option here there is
	 * no way to say "send an empty turn".
	 */
	function idleSubmission(atRisk: () => boolean) {
		const {cycleInfo, setTime} = fakeCycles(0);
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission<`0x${string}`, Action>({
			cycleInfo,
			adapter,
			storage: fakeStorage<Action>(),
			identity,
			commitWhenIdle: atRisk,
		});
		return {submission, calls, setTime};
	}

	/** Just inside the commit-time allowance, where autoCommit fires. */
	const CLOSING = config.commitPhaseDuration - 1;

	it('commits an empty turn when the cycle is about to close', async () => {
		const {submission, calls, setTime} = idleSubmission(() => true);
		const stop = submission.start();
		expect(submission.value.step).toBe('Idle');

		setTime(CLOSING);
		await vi.waitFor(() => expect(calls.commit.length).toBe(1));

		// Empty, and that is the point: the contract's action loop does nothing
		// with it, but the reveal that follows advances `lastCycleNumber`, which is the
		// only thing keeping the avatar alive.
		expect((calls.commit[0] as {actions: Action[]}).actions).toEqual([]);
		stop();
	});

	it('reveals it, which is the half that actually counts', async () => {
		// Committing alone would be worse than useless: it spends gas AND leaves a
		// commitment that blocks the next cycle until acknowledged.
		const {submission, calls, setTime} = idleSubmission(() => true);
		const stop = submission.start();

		setTime(CLOSING);
		await vi.waitFor(() => expect(submission.value.step).toBe('Committed'));

		setTime(config.commitPhaseDuration + 1);
		await vi.waitFor(() => expect(calls.reveal.length).toBe(1));
		expect((calls.reveal[0] as {actions: Action[]}).actions).toEqual([]);
		stop();
	});

	it('spends nothing while there is nothing at risk', async () => {
		// An entity waiting to enter play has no clock running against it, so an empty
		// commitment for it would burn gas to prevent nothing. This is why the
		// option is a predicate and not a flag.
		const {submission, calls, setTime} = idleSubmission(() => false);
		const stop = submission.start();

		setTime(CLOSING);
		setTime(config.commitPhaseDuration + 1);
		await new Promise((r) => setTimeout(r, 10));

		expect(calls.commit).toEqual([]);
		expect(calls.reveal).toEqual([]);
		stop();
	});

	it('KEEPS the loop turning, cycle after cycle, once a turn has been revealed', async () => {
		// THE WHOLE POINT OF IT, and it stopped after exactly one cycle. A submission
		// that has been revealed stays `Revealed` - nothing put it back to `Idle`
		// at the cycle boundary - and the idle commit only fires from `Idle`, so a
		// player who moved once and then stood still committed nothing ever again
		// and lost what they held four cycles later. Reported from play: "after 3 turns
		// the avatar dies".
		//
		// One cycle is 44 seconds here: the commit phase closes at 40 and the
		// reveal phase runs to 44.
		const {submission, calls, setTime} = idleSubmission(() => true);
		const stop = submission.start();

		// Cycle 0: a turn the player actually planned.
		submission.plan([{cellID: 42n}]);
		await submission.commit();
		setTime(41);
		await vi.waitFor(() => expect(submission.value.step).toBe('Revealed'));

		// Cycle 1, closing. The player has done nothing, and something is still at
		// risk, so the loop owes an empty turn.
		setTime(44 + CLOSING);
		await vi.waitFor(() => expect(calls.commit.length).toBe(2));
		expect((calls.commit[1] as {actions: Action[]}).actions).toEqual([]);

		// And it is the REVEAL that advances `lastCycleNumber`, so the submission has
		// to see this one through as well.
		setTime(44 + config.commitPhaseDuration + 1);
		await vi.waitFor(() => expect(calls.reveal.length).toBe(2));

		// Still going a third time, which is what "keeps turning" means.
		setTime(88 + CLOSING);
		await vi.waitFor(() => expect(calls.commit.length).toBe(3));
		stop();
	});

	it('keeps turning after a MISSED reveal, which is when it matters most', async () => {
		// A missed reveal already cost the player the turn and left a commitment the
		// contract will reject the next one over. Parking the submission on `Missed`
		// for good would then let the stake decay away in the silence that followed,
		// which is a second, larger punishment for the same mistake.
		const {submission, calls, setTime} = idleSubmission(() => true);
		const stop = submission.start();

		submission.plan([{cellID: 42n}]);
		await submission.commit();
		expect(submission.value.step).toBe('Committed');

		// The cycle turns over with the commitment still open: the reveal window
		// has gone.
		setTime(44);
		await vi.waitFor(() => expect(submission.value.step).toBe('Missed'));

		setTime(44 + CLOSING);
		await vi.waitFor(() => expect(calls.commit.length).toBe(2));
		stop();
	});

	it('never sends a second commitment for a cycle it has already played', async () => {
		// The guard on "a finished submission is nothing pending": finished IN AN
		// EARLIER cycle. One commitment per cycle is the contract's rule, and a
		// submission that has been revealed has already had its one; committing again
		// against it would spend gas to be rejected.
		const {submission, calls, setTime} = idleSubmission(() => true);
		const stop = submission.start();

		submission.plan([{cellID: 42n}]);
		await submission.commit();
		await submission.reveal();
		// Cycle 2 is the FIRST cycle: they are numbered from 2, which `cycle.ts`
		// explains and every other test here spells out the same way.
		expect(submission.value).toMatchObject({step: 'Revealed', cycleNumber: 2});
		expect(calls.commit).toHaveLength(1);

		// Still cycle 0, still its commit phase.
		setTime(CLOSING);
		await submission.commit();
		await new Promise((r) => setTimeout(r, 10));
		expect(calls.commit).toHaveLength(1);
		stop();
	});

	it('is off unless a game asks for it', async () => {
		// The default has to stay "a quiet cycle just passes": for the template's
		// own game an empty commitment is gas spent to say nothing.
		const {cycleInfo, setTime} = fakeCycles(0);
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission<`0x${string}`, Action>({
			cycleInfo,
			adapter,
			storage: fakeStorage<Action>(),
			identity,
		});
		const stop = submission.start();

		setTime(CLOSING);
		await new Promise((r) => setTimeout(r, 10));

		expect(calls.commit).toEqual([]);
		stop();
	});
});

/**
 * Taking up a submission this browser did not create.
 *
 * The chain, not local storage, is what says a commitment exists, and the two
 * disagree for a whole family of ordinary reasons: a cleared browser, a second
 * device, a private window, a storage write that failed. `adopt` is the ONE
 * method the framework offers for it, and the constraint that keeps it one
 * method is that it introduces no state - a reconstructed submission is a
 * restored submission and nothing downstream may be able to tell.
 */
describe('adopting a submission from somewhere other than storage', () => {
	it('takes up a committed submission for the current cycle and reveals it', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		// Nothing local: this browser has never seen the submission.
		expect(submission.value.step).toBe('Idle');

		const adopted = submission.adopt({
			cycleNumber: 2,
			actions: [{cellID: 7n}],
			secret: '0xsecret' as `0x${string}`,
			committed: true,
		});

		expect(adopted).toBe(true);
		// A RESTORED submission, indistinguishable from one this browser committed.
		expect(submission.value).toEqual({
			step: 'Committed',
			cycleNumber: 2,
			actions: [{cellID: 7n}],
		});

		// And the reveal goes out by itself, which is the whole point: the stake
		// is saved by the submission's ordinary machinery, not by a second path.
		setTime(41);
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		expect(calls.reveal[0]).toMatchObject({
			actions: [{cellID: 7n}],
			secret: '0xsecret',
		});
		stop();
	});

	it('saves what it adopted, so a second reload is an ordinary restore', () => {
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.adopt({
			cycleNumber: 2,
			actions: [{cellID: 7n}],
			secret: '0xsecret' as `0x${string}`,
			committed: true,
		});

		expect(storage.current).toEqual({
			cycleNumber: 2,
			actions: [{cellID: 7n}],
			secret: '0xsecret',
			committed: true,
		});
		stop();
	});

	it('REFUSES a submission from a past cycle, rather than owing a reveal that cannot land', async () => {
		// The reveal window for an earlier cycle has shut. Adopting one would put
		// the submission into `Committed` for a cycle that is over, and it would then
		// spend gas on a reveal the contract refuses. A commitment left over from
		// an earlier cycle is a MISSED reveal, which is a settlement the player
		// presses for themselves - not something to recover.
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		setTime(44 * 3 + 1);
		const adopted = submission.adopt({
			cycleNumber: 2,
			actions: [{cellID: 7n}],
			secret: '0xsecret' as `0x${string}`,
			committed: true,
		});

		expect(adopted).toBe(false);
		expect(submission.value.step).toBe('Idle');
		// Nothing was stored, so a reload does not resurrect it either.
		expect(storage.current).toBeUndefined();

		setTime(44 * 3 + 41);
		await new Promise((r) => setTimeout(r, 10));
		expect(calls.reveal).toEqual([]);
		stop();
	});

	it('REFUSES while a commitment of its own is in flight, because storage holds that secret', async () => {
		// This writes to storage, and storage is where the secret for an unlanded
		// commitment lives. Overwriting it mid-commit leaves a commitment on chain
		// whose secret is gone - the exact loss the submission is arranged to
		// prevent, arriving silently.
		let release: (() => void) | undefined;
		const {cycleInfo} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = fakeAdapter({
			commit: () =>
				new Promise((resolve) => {
					release = () => resolve({hash: '0xcommit' as `0x${string}`});
				}),
		});
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.plan([{cellID: 1n}]);
		const committing = submission.commit();
		await vi.waitFor(() => expect(submission.value.step).toBe('Committing'));
		const secretInFlight = (storage.current as {secret: string}).secret;

		const adopted = submission.adopt({
			cycleNumber: 2,
			actions: [{cellID: 99n}],
			secret: '0xdifferent' as `0x${string}`,
			committed: true,
		});

		expect(adopted).toBe(false);
		expect((storage.current as {secret: string}).secret).toBe(secretInFlight);

		release?.();
		await committing;
		expect(submission.value).toMatchObject({
			step: 'Committed',
			actions: [{cellID: 1n}],
		});
		stop();
	});

	it('adopts an UNCOMMITTED submission as a plan, not as something owing a reveal', async () => {
		// The same door serves `restore()`, which is where this body came from, and
		// a stored-but-unsent submission is a plan. Reporting it as `Committed` would
		// have the submission try to reveal a commitment that is not on chain.
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
		});
		const stop = submission.start();

		submission.adopt({
			cycleNumber: 2,
			actions: [{cellID: 7n}],
			secret: '0xsecret' as `0x${string}`,
			committed: false,
		});

		expect(submission.value.step).toBe('Planning');
		setTime(41);
		await new Promise((r) => setTimeout(r, 10));
		expect(calls.reveal).toEqual([]);
		stop();
	});
});

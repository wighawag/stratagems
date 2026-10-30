import {describe, expect, it, vi} from 'vitest';
import {get, writable, type Readable} from 'svelte/store';
import {
	createSubmission,
	type PersistedSubmission,
	type SubmissionState,
	type SubmissionStorage,
} from '$lib/game/core/submission';
import {
	calculateCycleInfo,
	type CycleConfig,
	type CycleInfo,
	type CycleInfoStore,
} from '$lib/game/core/cycle';
import type {
	CommitmentStatus,
	CommitOutcome,
	CommitRevealAdapter,
	RevealOutcome,
	RevealScheduler,
} from '$lib/game/core/seams';
import type {LiveCommitment} from '$lib/game/core/recovery';

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

function fakeStorage<
	TAction,
	TExtensions extends object = {},
>(): SubmissionStorage<TAction, TExtensions> & {
	readonly current: unknown;
} {
	let stored: ReturnType<SubmissionStorage<TAction, TExtensions>['load']>;
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
	commit?: () => Promise<CommitOutcome<{test?: {slot: string}}>>;
	reveal?: () => Promise<RevealOutcome>;
}) {
	const calls = {commit: [] as unknown[], reveal: [] as unknown[]};
	const adapter: CommitRevealAdapter<`0x${string}`, Action> = {
		buildCommitment: ({secret}) => ({
			hash: `0xhash${secret.slice(2, 6)}` as `0x${string}`,
			encoded: '0x' as `0x${string}`,
		}),
		commit: async (params) => {
			calls.commit.push(params);
			// The fake answers for one extension type whatever the caller's: the
			// seam's commit is generic over it, and the test picks the answer.
			return (
				overrides?.commit
					? await overrides.commit()
					: {hash: '0xcommit' as `0x${string}`}
			) as CommitOutcome<never>;
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

		// With the hash it was committed under, which the adopted record did not
		// carry: the key a committed turn is filed under.
		expect(storage.current).toEqual({
			cycleNumber: 2,
			actions: [{cellID: 7n}],
			secret: '0xsecret',
			committed: true,
			commitmentHash: '0xhashsecr',
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

describe('a reveal handed to a scheduler (P3, P7)', () => {
	type Extensions = {test?: {slot: string}};
	const scheduler: RevealScheduler<`0x${string}`, Extensions> = {
		prepare: async () => ({payee: player, value: 0n}),
		submit: async () => ({test: {slot: 'x'}}),
	};

	function setup(outcome: CommitOutcome<Extensions>) {
		const cycles = fakeCycles(0);
		const storage = fakeStorage<Action, Extensions>();
		const fake = fakeAdapter({commit: async () => outcome});
		const submission = createSubmission({
			cycleInfo: cycles.cycleInfo,
			adapter: fake.adapter,
			storage,
			identity,
			scheduler,
			autoReveal: 'fallback',
		});
		return {...cycles, storage, ...fake, submission};
	}

	it('hands the scheduler to the commit, and keeps what it recorded with the turn', async () => {
		const {storage, calls, submission} = setup({
			hash: '0xcommit',
			revealScheduled: true,
			extensions: {test: {slot: 'cycle_2'}},
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();

		expect((calls.commit[0] as {scheduler?: unknown}).scheduler).toBe(
			scheduler,
		);
		expect(storage.current).toMatchObject({
			committed: true,
			revealScheduled: true,
			extensions: {test: {slot: 'cycle_2'}},
		});
		expect(submission.value).toMatchObject({
			step: 'Committed',
			revealScheduled: true,
		});
		stop();
	});

	it('waits for the fallback point for a turn the scheduler holds', async () => {
		const {setTime, calls, submission} = setup({
			hash: '0xcommit',
			revealScheduled: true,
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		setTime(41);
		await new Promise((r) => setTimeout(r, 30));
		expect(calls.reveal).toHaveLength(0);
		stop();
	});

	it('reveals AT ONCE a turn whose scheduling failed, though the game chose fallback', async () => {
		// The commit stands (P3), and nobody else is going to reveal it.
		const {setTime, storage, calls, submission} = setup({
			hash: '0xcommit',
			revealScheduled: false,
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		expect(submission.value).toMatchObject({
			step: 'Committed',
			revealScheduled: false,
		});
		expect(storage.current).toMatchObject({revealScheduled: false});

		setTime(41); // the reveal phase has only just opened
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		stop();
	});

	it('reads an adapter that ignored the scheduler as NOT scheduled', async () => {
		const {setTime, calls, submission} = setup({hash: '0xcommit'});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		expect(submission.value).toMatchObject({revealScheduled: false});
		setTime(41);
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		stop();
	});

	it('keeps the per-turn answer across a reload', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action, Extensions>();
		storage.save({
			cycleNumber: 2,
			actions: [{cellID: 1n}],
			secret: '0x01',
			committed: true,
			revealScheduled: false,
		});
		const {adapter, calls} = fakeAdapter();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			scheduler,
			autoReveal: 'fallback',
		});
		const stop = submission.start();
		setTime(41);
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		stop();
	});
});

describe('a reveal somebody else sent is Revealed, not Missed (P9)', () => {
	function adapterAnswering(
		status: CommitmentStatus,
		overrides?: Parameters<typeof fakeAdapter>[0],
	) {
		const fake = fakeAdapter(overrides);
		const asked: unknown[] = [];
		const adapter: CommitRevealAdapter<`0x${string}`, Action> = {
			...fake.adapter,
			commitmentStatus: async (params) => {
				asked.push(params);
				return status;
			},
		};
		return {...fake, adapter, asked};
	}

	it('asks the chain at the cycle turn, and reports a turn it closed as revealed', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter, asked, calls} = adapterAnswering('revealed');
		const onSettled = vi.fn();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			// A scheduler holds the reveal; this browser never reached its fallback.
			autoReveal: 'never',
			onSettled,
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();

		setTime(44); // the next cycle
		await vi.waitFor(() =>
			expect(submission.value).toEqual({step: 'Revealed', cycleNumber: 2}),
		);
		expect(asked[0]).toMatchObject({
			identity: player,
			actions: [{cellID: 1n}],
			cycleNumber: 2,
		});
		expect(onSettled).toHaveBeenCalledOnce();
		expect(calls.reveal).toHaveLength(0);
		expect(storage.current).toBeUndefined();
		stop();
	});

	it('still reports MISSED a turn the chain is still holding', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = adapterAnswering('open');
		const onSettled = vi.fn();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			autoReveal: 'never',
			onSettled,
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		setTime(44);
		await vi.waitFor(() =>
			expect(submission.value).toEqual({step: 'Missed', cycleNumber: 2}),
		);
		expect(onSettled).not.toHaveBeenCalled();
		stop();
	});

	it('asks the chain on restore before calling an older turn missed', async () => {
		for (const [status, step] of [
			['revealed', 'Revealed'],
			['open', 'Missed'],
			['unknown', 'Missed'],
		] as const) {
			const {cycleInfo} = fakeCycles(50); // cycle 3; the record is cycle 2's
			const storage = fakeStorage<Action>();
			storage.save({
				cycleNumber: 2,
				actions: [{cellID: 1n}],
				secret: '0x01',
				committed: true,
			});
			const {adapter} = adapterAnswering(status);
			const onSettled = vi.fn();
			const submission = createSubmission({
				cycleInfo,
				adapter,
				storage,
				identity,
				onSettled,
			});
			const stop = submission.start();
			await vi.waitFor(() =>
				expect(submission.value).toEqual({step, cycleNumber: 2}),
			);
			expect(onSettled).toHaveBeenCalledTimes(step === 'Revealed' ? 1 : 0);
			expect(storage.current).toBeUndefined();
			stop();
		}
	});

	it('reports Revealed when the reveal finds the turn already opened', async () => {
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = fakeAdapter({
			reveal: async () => ({alreadyRevealed: true}),
		});
		const onSettled = vi.fn();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			onSettled,
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		setTime(41);
		await vi.waitFor(() =>
			expect(submission.value).toEqual({step: 'Revealed', cycleNumber: 2}),
		);
		expect(onSettled).toHaveBeenCalledOnce();
		expect(storage.current).toBeUndefined();
		stop();
	});

	it('reports Revealed when a fallback reveal fails because the turn was opened meanwhile', async () => {
		// A game's own adapter may still throw on a closed commitment: the chain,
		// asked, says what happened.
		const {cycleInfo, setTime} = fakeCycles(0);
		const storage = fakeStorage<Action>();
		const {adapter} = adapterAnswering('revealed', {
			reveal: async () => {
				throw new Error('There is no commitment on chain left to reveal.');
			},
		});
		const onSettled = vi.fn();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity,
			autoReveal: 'fallback',
			onSettled,
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		setTime(43); // past the fallback point
		await vi.waitFor(() =>
			expect(submission.value).toEqual({step: 'Revealed', cycleNumber: 2}),
		);
		expect(onSettled).toHaveBeenCalledOnce();
		stop();
	});
});

describe('a storage that loads asynchronously (Q8-1, Q8-8)', () => {
	const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
	const BOB = '0x0000000000000000000000000000000000000b0b' as const;

	/**
	 * One record per identity, like the skeleton's per-identity storage, behind
	 * a readiness the test flips: the account data loading, loaded, switching.
	 */
	function loadingStorage(who: Readable<`0x${string}` | undefined>) {
		const records = new Map<string, PersistedSubmission<Action>>();
		const ready = writable(false);
		const durable: {
			gate?: Promise<void>;
			error?: Error;
			writes: PersistedSubmission<Action>[];
		} = {writes: []};
		const key = () => get(who) ?? 'nobody';
		const storage: SubmissionStorage<Action> = {
			ready: {subscribe: ready.subscribe},
			load: () => records.get(key()),
			save: (submission) => void records.set(key(), submission),
			clear: () => void records.delete(key()),
			saveDurably: async (submission) => {
				const owner = key();
				await durable.gate;
				if (durable.error) throw durable.error;
				durable.writes.push(submission);
				records.set(owner, submission);
			},
		};
		return {storage, records, ready, durable};
	}

	// `null` for nobody: a default parameter would swallow an explicit undefined.
	function setup(initial: `0x${string}` | null = ALICE) {
		const cycles = fakeCycles(0);
		const who = writable<`0x${string}` | undefined>(initial ?? undefined);
		const loading = loadingStorage(who);
		const fake = fakeAdapter();
		const submission = createSubmission({
			cycleInfo: cycles.cycleInfo,
			adapter: fake.adapter,
			storage: loading.storage,
			identity: who,
		});
		return {...cycles, who, ...loading, ...fake, submission};
	}

	const committedTurn = (cycleNumber = 2): PersistedSubmission<Action> => ({
		cycleNumber,
		actions: [{cellID: 9n}],
		secret: '0x09',
		committed: true,
	});

	it('refuses a plan and a commit before ready, and restores once ready', async () => {
		const {records, ready, calls, submission} = setup();
		records.set(ALICE, committedTurn());
		const stop = submission.start();

		// Loading: what is stored is not known yet, so nothing is shown in its
		// place and nothing can be planned over it.
		expect(submission.value.step).toBe('Idle');
		submission.plan([{cellID: 1n}]);
		expect(submission.value.step).toBe('Idle');
		await submission.commit();
		expect(calls.commit).toHaveLength(0);

		ready.set(true);
		expect(submission.value).toMatchObject({
			step: 'Committed',
			cycleNumber: 2,
			actions: [{cellID: 9n}],
		});
		stop();
	});

	it('makes a reveal asked for before ready wait, not return', async () => {
		const {records, ready, calls, setTime, submission} = setup();
		records.set(ALICE, committedTurn());
		const stop = submission.start();
		setTime(41); // reveal phase

		const asked = submission.reveal();
		await new Promise((r) => setTimeout(r, 20));
		expect(calls.reveal).toHaveLength(0);

		ready.set(true);
		await asked;
		expect(calls.reveal.length).toBeGreaterThanOrEqual(1);
		await vi.waitFor(() => expect(submission.value.step).toBe('Revealed'));
		stop();
	});

	it('clears nothing while loading: a cycle that turns is handled by the restore', async () => {
		const {records, ready, setTime, submission} = setup();
		records.set(ALICE, committedTurn(2));
		const stop = submission.start();
		setTime(44); // cycle 3, still loading
		expect(records.get(ALICE)).toBeDefined();
		expect(submission.value.step).toBe('Idle');

		ready.set(true);
		// The old reading, with no chain to ask: missed, and cleared now.
		expect(submission.value).toEqual({step: 'Missed', cycleNumber: 2});
		expect(records.get(ALICE)).toBeUndefined();
		stop();
	});

	it('restores for an identity that arrives after start (a gap even with localStorage)', () => {
		const {records, ready, who, submission} = setup(null);
		records.set(ALICE, committedTurn());
		ready.set(true);
		const stop = submission.start();
		expect(submission.value.step).toBe('Idle');

		who.set(ALICE);
		expect(submission.value).toMatchObject({step: 'Committed', cycleNumber: 2});
		stop();
	});

	it('follows an account switch: nothing of one shown as the other, both restored', () => {
		const {records, ready, who, submission} = setup();
		records.set(ALICE, committedTurn());
		ready.set(true);
		const stop = submission.start();
		expect(submission.value.step).toBe('Committed');

		// The switch: the data goes back to loading, then the identity moves.
		ready.set(false);
		expect(submission.value.step).toBe('Idle');
		who.set(BOB);
		expect(submission.value.step).toBe('Idle');
		ready.set(true);
		expect(submission.value.step).toBe('Idle');
		expect(records.get(ALICE)).toBeDefined();

		ready.set(false);
		who.set(ALICE);
		ready.set(true);
		expect(submission.value).toMatchObject({step: 'Committed', cycleNumber: 2});
		stop();
	});

	it('writes nothing for one account into another when the switch lands mid-commit', async () => {
		const cycles = fakeCycles(0);
		const who = writable<`0x${string}` | undefined>(ALICE);
		const {storage, records, ready} = loadingStorage(who);
		let land!: () => void;
		const {adapter} = fakeAdapter({
			commit: () =>
				new Promise((resolve) => {
					land = () => resolve({hash: '0xcommit'});
				}),
		});
		const submission = createSubmission({
			cycleInfo: cycles.cycleInfo,
			adapter,
			storage,
			identity: who,
		});
		ready.set(true);
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		const committing = submission.commit();
		await vi.waitFor(() => expect(submission.value.step).toBe('Committing'));
		// The secret went to ALICE's storage BEFORE the commit was sent.
		expect(records.get(ALICE)).toMatchObject({committed: false});

		ready.set(false);
		who.set(BOB);
		ready.set(true);
		land();
		await committing;

		expect(submission.value.step).toBe('Idle');
		expect(records.get(BOB)).toBeUndefined();
		// ALICE's record still holds the secret for the commitment that landed;
		// the chain's hash recovers it when she comes back (see recovery).
		expect(records.get(ALICE)).toMatchObject({
			committed: false,
			secret: expect.any(String),
		});
		stop();
	});

	it('stores the secret DURABLY before sending the commit', async () => {
		const {ready, durable, calls, submission} = setup();
		let release!: () => void;
		durable.gate = new Promise((r) => (release = r));
		ready.set(true);
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		const committing = submission.commit();
		await new Promise((r) => setTimeout(r, 20));
		expect(calls.commit).toHaveLength(0);

		release();
		await committing;
		expect(durable.writes[0]).toMatchObject({committed: false});
		expect(calls.commit).toHaveLength(1);
		expect(submission.value.step).toBe('Committed');
		stop();
	});

	it('refuses the commit when the durable write fails', async () => {
		const {ready, durable, calls, submission} = setup();
		durable.error = new Error('account data could not be stored');
		ready.set(true);
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		expect(calls.commit).toHaveLength(0);
		expect(submission.value).toMatchObject({
			step: 'Error',
			during: 'commit',
			message: 'account data could not be stored',
			actions: [{cellID: 1n}],
		});
		stop();
	});
});

describe('committed turns kept apart, late records and two devices (Q8-2, Q8-9)', () => {
	const H1 = `0x${'11'.repeat(24)}` as const;
	const H2 = `0x${'22'.repeat(24)}` as const;

	/** A storage with the committed turns kept apart, as the account data's. */
	function splitStorage() {
		let plan: PersistedSubmission<Action> | undefined;
		const committed = new Map<string, PersistedSubmission<Action>>();
		const changes = writable(0);
		const settled: number[] = [];
		const storage: SubmissionStorage<Action> = {
			load: () => plan,
			save: (s) => {
				plan = s;
				const key = `${s.cycleNumber}_${s.commitmentHash}`;
				if (s.committed && !committed.has(key)) committed.set(key, s);
			},
			clear: () => (plan = undefined),
			committedTurns: (cycle) =>
				[...committed.values()].filter((t) => t.cycleNumber === cycle),
			changes,
			settled: (cycle) => void settled.push(cycle),
		};
		/** What another device's write looks like once it has synced. */
		function arrives(turn: PersistedSubmission<Action>) {
			committed.set(`${turn.cycleNumber}_${turn.commitmentHash}`, turn);
			changes.update((n) => n + 1);
		}
		return {
			storage,
			committed,
			settled,
			arrives,
			get plan() {
				return plan;
			},
			setPlan(p: PersistedSubmission<Action>) {
				plan = p;
			},
		};
	}

	const theirs = (
		hash: `0x${string}`,
		cellID = 7n,
	): PersistedSubmission<Action> => ({
		cycleNumber: 2,
		actions: [{cellID}],
		secret: '0x07',
		committed: true,
		commitmentHash: hash,
	});

	function setup(live?: LiveCommitment) {
		const cycles = fakeCycles(0);
		const split = splitStorage();
		const fake = fakeAdapter();
		const liveCommitment = writable<LiveCommitment | undefined>(live);
		const submission = createSubmission({
			cycleInfo: cycles.cycleInfo,
			adapter: fake.adapter,
			storage: split.storage,
			identity,
			liveCommitment,
			autoCommit: false,
		});
		return {...cycles, ...split, ...fake, liveCommitment, submission};
	}

	it("restores this cycle's committed turn first, then the plan", () => {
		const {setPlan, arrives, submission} = setup();
		setPlan({
			cycleNumber: 2,
			actions: [{cellID: 1n}],
			secret: '0x01',
			committed: false,
		});
		arrives(theirs(H1));
		const stop = submission.start();
		expect(submission.value).toMatchObject({
			step: 'Committed',
			actions: [{cellID: 7n}],
		});
		stop();
	});

	it('adopts a committed record that arrives after ready, over a local plan', () => {
		const {arrives, submission} = setup();
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		expect(submission.value.step).toBe('Planning');

		arrives(theirs(H1));
		expect(submission.value).toMatchObject({
			step: 'Committed',
			cycleNumber: 2,
			actions: [{cellID: 7n}],
		});
		stop();
	});

	it('does not take a synced record while a commit is in flight', async () => {
		const cycles = fakeCycles(0);
		const split = splitStorage();
		let land!: () => void;
		const {adapter} = fakeAdapter({
			commit: () =>
				new Promise((resolve) => (land = () => resolve({hash: '0xcommit'}))),
		});
		const submission = createSubmission({
			cycleInfo: cycles.cycleInfo,
			adapter,
			storage: split.storage,
			identity,
		});
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		const committing = submission.commit();
		await vi.waitFor(() => expect(submission.value.step).toBe('Committing'));
		split.arrives(theirs(H1));
		expect(submission.value.step).toBe('Committing');
		land();
		await committing;
		expect(submission.value).toMatchObject({
			step: 'Committed',
			actions: [{cellID: 1n}],
		});
		stop();
	});

	it('takes a synced PLAN only into an idle submission', () => {
		const {storage, setPlan, submission} = setup();
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		setPlan({
			cycleNumber: 2,
			actions: [{cellID: 3n}],
			secret: '0x03',
			committed: false,
		});
		(storage.changes as ReturnType<typeof writable<number>>).update(
			(n) => n + 1,
		);
		expect(submission.value).toMatchObject({actions: [{cellID: 1n}]});

		submission.plan([]);
		setPlan({
			cycleNumber: 2,
			actions: [{cellID: 3n}],
			secret: '0x03',
			committed: false,
		});
		(storage.changes as ReturnType<typeof writable<number>>).update(
			(n) => n + 1,
		);
		expect(submission.value).toMatchObject({
			step: 'Planning',
			actions: [{cellID: 3n}],
		});
		stop();
	});

	it('decides between two devices that both committed by the hash the chain holds', async () => {
		const {arrives, liveCommitment, setTime, calls, submission} = setup({
			cycleNumber: 2,
			hash: H2,
		});
		arrives(theirs(H1, 1n));
		arrives(theirs(H2, 2n));
		const stop = submission.start();
		expect(submission.value).toMatchObject({actions: [{cellID: 2n}]});

		// The chain's word changes (the laptop's commitment replaced the
		// phone's): the turn follows it.
		liveCommitment.set({cycleNumber: 2, hash: H1});
		expect(submission.value).toMatchObject({actions: [{cellID: 1n}]});

		setTime(41);
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));
		expect(calls.reveal[0]).toMatchObject({actions: [{cellID: 1n}]});
		stop();
	});

	it('takes up as COMMITTED a plan whose hash the chain holds', () => {
		// The commit went out and the tab closed (or the account switched) before
		// the committed record was written: the plan still holds the secret.
		const {setPlan, committed, submission} = setup({cycleNumber: 2, hash: H1});
		setPlan({
			cycleNumber: 2,
			actions: [{cellID: 4n}],
			secret: '0x04',
			committed: false,
			commitmentHash: H1,
		});
		const stop = submission.start();
		expect(submission.value).toMatchObject({
			step: 'Committed',
			actions: [{cellID: 4n}],
		});
		expect(committed.size).toBe(1);
		stop();
	});

	it('offers nothing the chain does not hold, so recovery can say so', () => {
		const {arrives, submission} = setup({cycleNumber: 2, hash: H2});
		arrives(theirs(H1));
		const stop = submission.start();
		expect(submission.value.step).toBe('Idle');
		stop();
	});

	it('records the commitment hash with the turn, and lets a revealed turn be pruned', async () => {
		const {setTime, settled, submission, committed} = setup();
		const stop = submission.start();
		submission.plan([{cellID: 1n}]);
		await submission.commit();
		expect([...committed.values()][0].commitmentHash).toMatch(/^0xhash/);
		setTime(41);
		await vi.waitFor(() => expect(submission.value.step).toBe('Revealed'));
		expect(settled).toEqual([2]);
		stop();
	});
});

describe('the review of step 8 item 4: a partly revealed turn, and a reveal across an identity switch', () => {
	const HEAD0 = `0x${'a0'.repeat(24)}` as const;
	const HEAD1 = `0x${'a1'.repeat(24)}` as const;

	it('restores a turn the chain holds at a LATER chunk, so the reveal resumes', () => {
		// After chunk i lands, the chain's head is chunk i+1's hash, not the
		// turn's first. A reload mid-reveal must still recognise the turn.
		const {cycleInfo} = fakeCycles(41); // reveal phase of cycle 2
		const storage = fakeStorage<Action>();
		storage.save({
			cycleNumber: 2,
			actions: [{cellID: 1n}, {cellID: 2n}],
			secret: '0x01',
			committed: true,
			commitmentHash: HEAD0,
		});
		const {adapter} = fakeAdapter({reveal: () => new Promise(() => {})});
		const withHeads: CommitRevealAdapter<`0x${string}`, Action> = {
			...adapter,
			isHeadOf: ({head}) => head === HEAD0 || head === HEAD1,
		};
		const submission = createSubmission({
			cycleInfo,
			adapter: withHeads,
			storage,
			identity,
			liveCommitment: writable<LiveCommitment | undefined>({
				cycleNumber: 2,
				hash: HEAD1,
			}),
		});
		const stop = submission.start();
		expect(['Committed', 'Revealing']).toContain(submission.value.step);
		stop();
	});

	it("does not let one identity's finishing reveal touch the next identity's turn", async () => {
		const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
		const BOB = '0x0000000000000000000000000000000000000b0b' as const;
		const who = writable<`0x${string}` | undefined>(ALICE);
		const records = new Map<string, PersistedSubmission<Action>>();
		const key = () => get(who) ?? 'nobody';
		const storage: SubmissionStorage<Action> = {
			load: () => records.get(key()),
			save: (s) => void records.set(key(), s),
			clear: () => void records.delete(key()),
		};
		const turnOf = (cellID: bigint): PersistedSubmission<Action> => ({
			cycleNumber: 2,
			actions: [{cellID}],
			secret: '0x01',
			committed: true,
		});
		records.set(ALICE, turnOf(1n));
		records.set(BOB, turnOf(2n));
		const {cycleInfo, setTime} = fakeCycles(0);
		let land!: () => void;
		const {adapter, calls} = fakeAdapter({
			reveal: () =>
				new Promise((resolve) => (land = () => resolve({hash: '0xreveal'}))),
		});
		const onSettled = vi.fn();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity: who,
			onSettled,
			autoReveal: 'never',
		});
		const stop = submission.start();
		setTime(41);
		const revealing = submission.reveal();
		await vi.waitFor(() => expect(calls.reveal).toHaveLength(1));

		who.set(BOB);
		expect(submission.value).toMatchObject({
			step: 'Committed',
			actions: [{cellID: 2n}],
		});
		land();
		await revealing;
		expect(submission.value).toMatchObject({
			step: 'Committed',
			actions: [{cellID: 2n}],
		});
		expect(records.get(BOB)).toBeDefined();
		stop();
	});

	it('files an adopted turn under its own commitment hash', () => {
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
			actions: [{cellID: 1n}],
			secret: '0x0123',
			committed: true,
		});
		expect(storage.current).toMatchObject({commitmentHash: '0xhash0123'});
		stop();
	});

	it("forgets the shown turn on a context change, so a later reveal cannot take the previous identity's", async () => {
		const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
		const BOB = '0x0000000000000000000000000000000000000b0b' as const;
		const who = writable<`0x${string}` | undefined>(ALICE);
		const records = new Map<string, PersistedSubmission<Action>>();
		const key = () => get(who) ?? 'nobody';
		const storage: SubmissionStorage<Action> = {
			load: () => records.get(key()),
			save: (s) => void records.set(key(), s),
			clear: () => void records.delete(key()),
		};
		records.set(ALICE, {
			cycleNumber: 2,
			actions: [{cellID: 1n}],
			secret: '0x01',
			committed: true,
		});
		const {cycleInfo} = fakeCycles(0);
		const {adapter, calls} = fakeAdapter({
			commit: async () => {
				throw new Error('rejected');
			},
		});
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity: who,
			autoCommit: false,
		});
		const stop = submission.start();
		expect(submission.value).toMatchObject({step: 'Committed'});

		who.set(BOB);
		submission.plan([{cellID: 2n}]);
		await submission.commit();
		expect(submission.value).toMatchObject({step: 'Error', during: 'commit'});
		await submission.reveal();
		expect(calls.reveal).toHaveLength(0);
		stop();
	});
});

describe('an earlier turn whose context is left while the chain is asked about it', () => {
	// Found by stratagems' step 8 e2e (a turn fuzd revealed, read on a new page
	// after the cycle turned): the account data reloading, or the identity
	// flickering, while the chain was asked dropped the answer, and the record
	// had already been cleared, so nothing was left to ask again: `Idle` for good.
	const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
	const BOB = '0x0000000000000000000000000000000000000b0b' as const;

	const earlierTurn = (cellID = 1n): PersistedSubmission<Action> => ({
		cycleNumber: 2,
		actions: [{cellID}],
		secret: '0x01',
		committed: true,
	});

	/**
	 * A record per identity behind a readiness, as the skeleton's per-identity
	 * account data; the clock in cycle 3 and the chain's answers held until the
	 * test gives them.
	 */
	function setup() {
		const {cycleInfo} = fakeCycles(50); // cycle 3; the records are cycle 2's
		const who = writable<`0x${string}` | undefined>(ALICE);
		const ready = writable(true);
		const records = new Map<string, PersistedSubmission<Action>>();
		const key = () => get(who) ?? 'nobody';
		const settled: [string, number][] = [];
		const storage: SubmissionStorage<Action> = {
			ready: {subscribe: ready.subscribe},
			load: () => records.get(key()),
			save: (s) => void records.set(key(), s),
			clear: () => void records.delete(key()),
			settled: (cycleNumber) => void settled.push([key(), cycleNumber]),
		};
		const asked: {identity: unknown; answer: (s: CommitmentStatus) => void}[] =
			[];
		const adapter: CommitRevealAdapter<`0x${string}`, Action> = {
			...fakeAdapter().adapter,
			commitmentStatus: ({identity}) =>
				new Promise<CommitmentStatus>((answer) =>
					asked.push({identity, answer}),
				),
		};
		const onSettled = vi.fn();
		const submission = createSubmission({
			cycleInfo,
			adapter,
			storage,
			identity: who,
			onSettled,
		});
		return {who, ready, records, settled, asked, onSettled, submission};
	}

	const tick = () => new Promise((r) => setTimeout(r, 0));

	const flickers = {
		'the account data reloading': (t: ReturnType<typeof setup>) => {
			t.ready.set(false);
			t.ready.set(true);
		},
		'the identity flickering': (t: ReturnType<typeof setup>) => {
			t.who.set(undefined);
			t.who.set(ALICE);
		},
	};

	for (const [flicker, leave] of Object.entries(flickers)) {
		for (const [status, step] of [
			['revealed', 'Revealed'],
			['open', 'Missed'],
		] as const) {
			for (const order of ['in the order asked', 'last asked first'] as const) {
				it(`reports ${step} after ${flicker}, the chain answering ${order}`, async () => {
					const t = setup();
					t.records.set(ALICE, earlierTurn());
					const stop = t.submission.start();
					await tick();
					expect(t.asked).toHaveLength(1);

					leave(t);
					await tick();
					const answers =
						order === 'in the order asked'
							? [...t.asked]
							: [...t.asked].reverse();
					for (const {answer} of answers) {
						answer(status);
						await tick();
					}

					await vi.waitFor(() =>
						expect(t.submission.value).toEqual({step, cycleNumber: 2}),
					);
					// Answered once: reported once, and nothing left to ask again.
					expect(t.onSettled).toHaveBeenCalledTimes(
						step === 'Revealed' ? 1 : 0,
					);
					expect(t.settled).toEqual(step === 'Revealed' ? [[ALICE, 2]] : []);
					expect(t.records.get(ALICE)).toBeUndefined();
					stop();
				});
			}
		}
	}

	it("drops the answer when the identity CHANGES, and asks again for the turn's own player", async () => {
		const t = setup();
		t.records.set(ALICE, earlierTurn(1n));
		t.records.set(BOB, {...earlierTurn(2n), cycleNumber: 3, committed: false});
		const stop = t.submission.start();
		await tick();
		expect(t.asked).toHaveLength(1);

		t.who.set(BOB);
		t.asked[0].answer('revealed');
		await tick();
		await tick();
		// BOB's plan, untouched; ALICE's answer written nowhere.
		expect(t.submission.value).toMatchObject({
			step: 'Planning',
			cycleNumber: 3,
		});
		expect(t.records.get(BOB)).toMatchObject({cycleNumber: 3});
		expect(t.onSettled).not.toHaveBeenCalled();
		expect(t.settled).toEqual([]);
		// ALICE's turn was not answered in her context, so it is still hers to ask.
		expect(t.records.get(ALICE)).toMatchObject({
			cycleNumber: 2,
			committed: true,
		});

		t.who.set(ALICE);
		await tick();
		expect(t.asked).toHaveLength(2);
		expect(t.asked[1].identity).toBe(ALICE);
		t.asked[1].answer('revealed');
		await vi.waitFor(() =>
			expect(t.submission.value).toEqual({step: 'Revealed', cycleNumber: 2}),
		);
		expect(t.settled).toEqual([[ALICE, 2]]);
		expect(t.records.get(ALICE)).toBeUndefined();
		stop();
	});

	it('asks once for a turn already being asked about, a reveal() meanwhile included', async () => {
		const t = setup();
		t.records.set(ALICE, earlierTurn());
		const stop = t.submission.start();
		await tick();
		await t.submission.reveal();
		await tick();
		expect(t.asked).toHaveLength(1);

		t.asked[0].answer('revealed');
		await vi.waitFor(() =>
			expect(t.submission.value).toEqual({step: 'Revealed', cycleNumber: 2}),
		);
		expect(t.onSettled).toHaveBeenCalledOnce();
		expect(t.settled).toEqual([[ALICE, 2]]);
		stop();
	});

	it('keeps a newer turn stored while an earlier one was asked about', async () => {
		// The cycle-turn path: the earlier turn closes, the player commits the next
		// one, and only then does the chain answer about the earlier.
		const t = setup();
		t.records.set(ALICE, earlierTurn());
		const stop = t.submission.start();
		await tick();
		const next = {...earlierTurn(5n), cycleNumber: 3, secret: '0x05' as const};
		t.records.set(ALICE, next);
		t.asked[0].answer('revealed');
		await vi.waitFor(() =>
			expect(t.submission.value).toEqual({step: 'Revealed', cycleNumber: 2}),
		);
		expect(t.records.get(ALICE)).toEqual(next);
		stop();
	});
});

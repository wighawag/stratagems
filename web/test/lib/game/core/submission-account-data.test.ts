import {describe, expect, it, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import type {AsyncStorage, WatchableStorage} from 'synqable';
import {createAccountData} from '$lib/account/AccountData';
import {
	SUBMISSION_FIELDS,
	createAccountDataSubmissionStorage,
	type SubmissionStorageFormat,
} from '$lib/game/core/commit-reveal/storage';
import {currentIdentityStorage} from '$lib/game/core/commit-reveal-game';
import {createSubmission} from '$lib/game/core/submission';
import {calculateCycleInfo, type CycleInfoStore} from '$lib/game/core/cycle';
import type {LiveCommitment} from '$lib/game/core/recovery';
import type {CommitRevealAdapter} from '$lib/game/core/seams';
import {
	ALICE,
	BOB,
	SCOPE,
	accountStore,
	controlledStorage,
	deployments,
	storageKey,
} from '../../account/account-data-harness';

/**
 * THE SUBMISSION OVER THE REAL ACCOUNT DATA (Q8-8), through the skeleton's own
 * storage (`currentIdentityStorage`): the account data loads asynchronously,
 * switches account, fails to load or to save, and hears another device, and
 * the submission has to be right through each of them. The account is the
 * identity here, as in the reference game.
 */
type Action = {cellID: bigint};
const FORMAT: SubmissionStorageFormat<Action> = {
	encode: (a) => a.cellID.toString(),
	decode: (s) => ({cellID: BigInt(s as string)}),
};
const GAME = '0x00000000000000000000000000000000000000c0' as const;

function cycles(initialTime: number) {
	const config = {
		commitPhaseDuration: 40,
		revealPhaseDuration: 4,
		startTime: 0,
		commitTimeAllowance: 4.1,
		policy: 'timed' as const,
	};
	const time = writable(initialTime);
	const store: CycleInfoStore = {
		subscribe: (run) =>
			time.subscribe((t) => run(calculateCycleInfo(t, config))),
		now: () => calculateCycleInfo(get(time), config),
		fromTime: (t) => calculateCycleInfo(t, config),
	};
	return {cycleInfo: store, setTime: (t: number) => time.set(t)};
}

function adapter(overrides?: {commit?: () => Promise<{hash: `0x${string}`}>}) {
	const calls = {commit: 0, reveal: [] as unknown[]};
	const value: CommitRevealAdapter<`0x${string}`, Action> = {
		buildCommitment: ({actions, secret}) => ({
			hash: `0x${secret.slice(2, 6)}${actions.map((a) => a.cellID).join('')}`.padEnd(
				50,
				'0',
			) as `0x${string}`,
			encoded: '0x',
		}),
		commit: async () => {
			calls.commit++;
			return overrides?.commit ? overrides.commit() : {hash: '0xcommit'};
		},
		reveal: async (params) => {
			calls.reveal.push(params);
			return {hash: '0xreveal'};
		},
	};
	return {adapter: value, calls};
}

function setup(
	options: {
		storage?: {adapter: () => AsyncStorage<never>};
		commit?: () => Promise<{hash: `0x${string}`}>;
		live?: LiveCommitment;
	} = {},
) {
	const backing = options.storage ?? controlledStorage();
	const account = accountStore(ALICE);
	const accountData = createAccountData({
		accountStore: account,
		deployments,
		clock: {now: () => Date.now()} as never,
		scopeAddress: SCOPE,
		storageAdapter: backing.adapter,
		fields: SUBMISSION_FIELDS,
	});
	const stopAccountData = accountData.subscribe(() => {});
	const storage = currentIdentityStorage(account, (who) =>
		createAccountDataSubmissionStorage({
			accountData,
			format: FORMAT,
			chainId: 1,
			contract: GAME,
			identity: who,
		}),
	);
	const clock = cycles(0);
	const fake = adapter({commit: options.commit});
	const liveCommitment = writable<LiveCommitment | undefined>(options.live);
	const submission = createSubmission({
		cycleInfo: clock.cycleInfo,
		adapter: fake.adapter,
		storage,
		identity: account,
		liveCommitment,
		autoCommit: false,
	});
	const stopSubmission = submission.start();
	return {
		...clock,
		...fake,
		account,
		accountData,
		submission,
		liveCommitment,
		stop() {
			stopSubmission();
			stopAccountData();
		},
	};
}

/** What is stored for one account, in its own account data. */
function storedFor(
	backing: ReturnType<typeof controlledStorage>,
	account: `0x${string}`,
) {
	return backing.saved.get(storageKey(account)) as
		| {
				data: {
					submissions: Record<string, {turn: unknown}>;
					committedTurns: Record<string, unknown>;
				};
		  }
		| undefined;
}

describe('the submission over the real account data (Q8-8)', () => {
	it('reads nothing, plans nothing and commits nothing before the account data loads', async () => {
		const backing = controlledStorage();
		backing.hold();
		const {submission, calls, stop} = setup({storage: backing});
		try {
			expect(submission.value.step).toBe('Idle');
			submission.plan([{cellID: 1n}]);
			await submission.commit();
			expect(submission.value.step).toBe('Idle');
			expect(calls.commit).toBe(0);
			backing.release();
			await vi.waitFor(() => {
				submission.plan([{cellID: 1n}]);
				expect(submission.value.step).toBe('Planning');
			});
		} finally {
			stop();
		}
	});

	it("restores a committed turn on reload, from the account data's own fields", async () => {
		const backing = controlledStorage();
		const first = setup({storage: backing});
		await vi.waitFor(() =>
			expect(get(first.accountData.lifecycle$).status).toBe('ready'),
		);
		first.submission.plan([{cellID: 5n}]);
		await first.submission.commit();
		expect(first.submission.value.step).toBe('Committed');
		await first.accountData.get()!.persisted();
		first.stop();

		const second = setup({storage: backing});
		try {
			await vi.waitFor(() =>
				expect(second.submission.value).toMatchObject({
					step: 'Committed',
					actions: [{cellID: 5n}],
				}),
			);
		} finally {
			second.stop();
		}
	});

	it('writes nothing of one account into the other when the account switches mid-commit, and takes the turn back up', async () => {
		const backing = controlledStorage();
		let land!: () => void;
		const {submission, account, accountData, liveCommitment, stop} = setup({
			storage: backing,
			commit: () =>
				new Promise((resolve) => (land = () => resolve({hash: '0xcommit'}))),
		});
		try {
			await vi.waitFor(() =>
				expect(get(accountData.lifecycle$).status).toBe('ready'),
			);
			submission.plan([{cellID: 3n}]);
			const committing = submission.commit();
			await vi.waitFor(() => expect(submission.value.step).toBe('Committing'));
			// The secret is on ALICE's storage before the commitment is sent.
			await vi.waitFor(() =>
				expect(
					Object.values(storedFor(backing, ALICE)!.data.submissions)[0].turn,
				).toMatchObject({committed: false}),
			);

			account.set(BOB);
			await vi.waitFor(() =>
				expect(get(accountData.lifecycle$)).toMatchObject({
					status: 'ready',
					account: BOB,
				}),
			);
			land();
			await committing;
			expect(submission.value.step).toBe('Idle');
			await accountData.get()!.persisted();
			const bob = storedFor(backing, BOB);
			expect(Object.keys(bob?.data.submissions ?? {})).toEqual([]);
			expect(Object.keys(bob?.data.committedTurns ?? {})).toEqual([]);

			// Back to ALICE: her plan's record holds the secret and the hash, and
			// the chain's commitment takes it up as her committed turn.
			account.set(ALICE);
			await vi.waitFor(() =>
				expect(get(accountData.lifecycle$)).toMatchObject({
					status: 'ready',
					account: ALICE,
				}),
			);
			const stored = Object.values(
				storedFor(backing, ALICE)!.data.submissions,
			)[0].turn as {secret: `0x${string}`; commitmentHash: `0x${string}`};
			expect(submission.value.step).toBe('Planning');
			liveCommitment.set({cycleNumber: 2, hash: stored.commitmentHash});
			expect(submission.value).toMatchObject({
				step: 'Committed',
				actions: [{cellID: 3n}],
			});
			// And it is now recorded as her committed turn.
			await accountData.get()!.persisted();
			expect(
				Object.keys(storedFor(backing, ALICE)!.data.committedTurns),
			).toHaveLength(1);
		} finally {
			stop();
		}
	});

	it('refuses the commit when the account data cannot store the secret', async () => {
		const backing = controlledStorage();
		const {submission, accountData, calls, stop} = setup({storage: backing});
		try {
			await vi.waitFor(() =>
				expect(get(accountData.lifecycle$).status).toBe('ready'),
			);
			backing.saveError = new Error('quota exceeded');
			submission.plan([{cellID: 1n}]);
			await submission.commit();
			expect(calls.commit).toBe(0);
			expect(submission.value).toMatchObject({step: 'Error', during: 'commit'});
			expect((submission.value as {message: string}).message).toMatch(
				/quota exceeded/,
			);
		} finally {
			stop();
		}
	});

	it('blocks play on a load error rather than showing an empty turn', async () => {
		const backing = controlledStorage();
		backing.loadError = new Error('could not decrypt');
		const {submission, accountData, stop} = setup({storage: backing});
		try {
			await vi.waitFor(() =>
				expect(get(accountData.lifecycle$).status).toBe('error'),
			);
			submission.plan([{cellID: 1n}]);
			expect(submission.value.step).toBe('Idle');
		} finally {
			stop();
		}
	});

	it("adopts a committed turn another device synced, over this one's plan", async () => {
		const control = controlledStorage();
		const listeners = new Map<string, (key: string, value: never) => void>();
		const watchable = {
			adapter: (): WatchableStorage<never> => ({
				...(control.adapter() as AsyncStorage<never>),
				watch(key, callback) {
					listeners.set(key, callback as never);
					return () => listeners.delete(key);
				},
			}),
		};
		const laptop = setup({storage: watchable});
		const phoneBacking = controlledStorage();
		const phone = setup({storage: phoneBacking});
		try {
			await vi.waitFor(() =>
				expect(get(laptop.accountData.lifecycle$).status).toBe('ready'),
			);
			await vi.waitFor(() =>
				expect(get(phone.accountData.lifecycle$).status).toBe('ready'),
			);
			laptop.submission.plan([{cellID: 1n}]);

			phone.submission.plan([{cellID: 8n}]);
			await phone.submission.commit();
			await phone.accountData.get()!.persisted();

			listeners.get(storageKey(ALICE))?.(
				storageKey(ALICE),
				structuredClone(phoneBacking.saved.get(storageKey(ALICE))) as never,
			);
			await vi.waitFor(() =>
				expect(laptop.submission.value).toMatchObject({
					step: 'Committed',
					actions: [{cellID: 8n}],
				}),
			);
		} finally {
			laptop.stop();
			phone.stop();
		}
	});
});

describe('the committed turn on storage before Committed is reported', () => {
	// stratagems' step 8: the committed record (the plan's slot at
	// `committed: true` and the `committedTurns` entry, written once) went out
	// with a plain save, behind the account data's debounce, and a tab closed
	// right after `Committed` kept only the pre-commit record.
	function landing() {
		let land!: () => void;
		const commit = () =>
			new Promise<{hash: `0x${string}`}>(
				(resolve) => (land = () => resolve({hash: '0xcommit'})),
			);
		return {commit, land: () => land()};
	}

	/** Plan and commit until the commitment is on chain's doorstep. */
	async function untilSent(
		t: ReturnType<typeof setup>,
		backing: ReturnType<typeof controlledStorage>,
	) {
		await vi.waitFor(() =>
			expect(get(t.accountData.lifecycle$).status).toBe('ready'),
		);
		t.submission.plan([{cellID: 4n}]);
		const committing = t.submission.commit();
		await vi.waitFor(() => expect(t.calls.commit).toBe(1));
		expect(
			Object.values(storedFor(backing, ALICE)!.data.submissions)[0].turn,
		).toMatchObject({committed: false});
		// Wrapped: an async function returning the promise would await it.
		return {committing};
	}

	it('has the committed turn on storage, committedTurns included, the moment Committed is reported', async () => {
		const backing = controlledStorage();
		const chain = landing();
		const t = setup({storage: backing, commit: chain.commit});
		try {
			const {committing} = await untilSent(t, backing);
			backing.holdSaves();
			chain.land();
			await new Promise((r) => setTimeout(r, 30));
			// On chain, its record not yet on storage: not Committed.
			expect(t.submission.value.step).toBe('Committing');

			backing.releaseSaves();
			await committing;
			expect(t.submission.value.step).toBe('Committed');
			// Read straight off storage, with no `persisted()` awaited: what a
			// page closed now leaves behind.
			const stored = storedFor(backing, ALICE)!.data;
			expect(Object.values(stored.submissions)[0].turn).toMatchObject({
				committed: true,
			});
			expect(Object.values(stored.committedTurns)).toEqual([
				expect.objectContaining({committed: true}),
			]);
		} finally {
			t.stop();
		}
	});

	it('leaves a page opened in a later cycle the committed turn, not an uncommitted plan', async () => {
		const backing = controlledStorage();
		const first = setup({storage: backing});
		await vi.waitFor(() =>
			expect(get(first.accountData.lifecycle$).status).toBe('ready'),
		);
		first.submission.plan([{cellID: 5n}]);
		await first.submission.commit();
		expect(first.submission.value.step).toBe('Committed');
		// Closed at once: nothing awaited after Committed.
		first.stop();

		const second = setup({storage: backing});
		second.setTime(50);
		try {
			await vi.waitFor(() =>
				expect(get(second.accountData.lifecycle$).status).toBe('ready'),
			);
			// Asked about as a committed turn (this adapter cannot be asked, so
			// it reads Missed), and kept for the settlement, not dropped.
			await vi.waitFor(() =>
				expect(second.submission.value).toEqual({
					step: 'Missed',
					cycleNumber: 2,
				}),
			);
			expect(
				Object.keys(second.accountData.read()!.committedTurns),
			).toHaveLength(1);
		} finally {
			second.stop();
		}
	});

	it('reports a committed record the account data could not store, and keeps the turn', async () => {
		const backing = controlledStorage();
		const chain = landing();
		const t = setup({storage: backing, commit: chain.commit});
		try {
			const {committing} = await untilSent(t, backing);
			backing.saveError = new Error('quota exceeded');
			chain.land();
			await expect(committing).resolves.toBeUndefined();
			expect(t.submission.value).toMatchObject({
				step: 'Committed',
				actions: [{cellID: 4n}],
			});
			expect(
				(t.submission.value as {notStored?: {message: string}}).notStored
					?.message,
			).toMatch(/quota exceeded/);
			// In memory still, for a later save to take.
			expect(Object.keys(t.accountData.read()!.committedTurns)).toHaveLength(1);
		} finally {
			t.stop();
		}
	});

	it('writes nothing into the next account when it switches during the write', async () => {
		const backing = controlledStorage();
		const chain = landing();
		const t = setup({storage: backing, commit: chain.commit});
		try {
			const {committing} = await untilSent(t, backing);
			backing.holdSaves();
			chain.land();
			await new Promise((r) => setTimeout(r, 30));
			t.account.set(BOB);
			await vi.waitFor(() =>
				expect(get(t.accountData.lifecycle$)).toMatchObject({
					status: 'ready',
					account: BOB,
				}),
			);
			backing.releaseSaves();
			await committing;
			expect(t.submission.value.step).toBe('Idle');
			// ALICE's turn reached HER storage, and BOB's holds nothing.
			await vi.waitFor(() =>
				expect(
					Object.keys(storedFor(backing, ALICE)!.data.committedTurns),
				).toHaveLength(1),
			);
			const bob = storedFor(backing, BOB);
			expect(Object.keys(bob?.data.committedTurns ?? {})).toEqual([]);
		} finally {
			t.stop();
		}
	});
});

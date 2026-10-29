import {describe, expect, expectTypeOf, it, vi} from 'vitest';
import {get} from 'svelte/store';
import type {AsyncStorage, WatchableStorage} from 'synqable';
import {createAccountData} from '$lib/account/AccountData';
import {AccountDataNotStoredError} from '$lib/account/durable-write';
import {
	COMMITTED_TURNS_KEPT,
	SUBMISSION_FIELDS,
	committedTurnKey,
	createAccountDataSubmissionStorage,
	storedTurnsFor,
	submissionKey,
	type SubmissionStorageFormat,
} from '$lib/game/core/commit-reveal/storage';
import type {PersistedSubmission} from '$lib/game/core/submission';
import {
	ALICE,
	SCOPE,
	accountStore,
	controlledStorage,
	deployments,
	storageKey,
} from '../../../account/account-data-harness';

/**
 * The submission storage in the ACCOUNT DATA (P8 b, Q8-9), for a game whose
 * action is not a placement and that uses a layer which keeps something with
 * each turn. Real account data over storage the test controls: what is pinned
 * is what lands in it, what survives a merge with another device, and that a
 * game's types come back as it wrote them.
 */
type Move = {position: bigint; color: number};
type Extensions = {fuzd?: {slot: string; scheduledAt: number}};

const MOVES: SubmissionStorageFormat<Move> = {
	encode: (move) => [move.position.toString(), move.color],
	decode: (stored) => {
		const [position, color] = stored as [string, number];
		return {position: BigInt(position), color};
	},
};

const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000aa' as const;
const GAME = '0x00000000000000000000000000000000000000c0' as const;
const TOKEN = 5n;

/**
 * A storage adapter another device can be heard through: `deliver` hands the
 * listener what the other device saved, as a sync (or another tab) would.
 */
function watchableStorage() {
	const control = controlledStorage();
	const listeners = new Map<string, (key: string, value: never) => void>();
	const adapter = (): WatchableStorage<never> => ({
		...(control.adapter() as AsyncStorage<never>),
		watch(key, callback) {
			listeners.set(key, callback as never);
			return () => listeners.delete(key);
		},
	});
	return {
		control,
		adapter,
		deliver(key: string, value: unknown) {
			listeners.get(key)?.(key, structuredClone(value) as never);
		},
	};
}

function device(
	storage: {adapter: () => AsyncStorage<never>} = controlledStorage(),
	clockAt = {now: 1000},
) {
	const account = accountStore(ALICE);
	const accountData = createAccountData({
		accountStore: account,
		deployments,
		clock: {now: () => clockAt.now} as never,
		scopeAddress: SCOPE,
		storageAdapter: storage.adapter,
		fields: SUBMISSION_FIELDS,
	});
	const stopAccountData = accountData.subscribe(() => {});
	const submissions = createAccountDataSubmissionStorage<
		Move,
		Extensions,
		bigint
	>({
		accountData,
		format: MOVES,
		chainId: 1,
		contract: GAME,
		identity: TOKEN,
	});
	return {account, accountData, submissions, stop: stopAccountData, clockAt};
}

const turn = (
	cycleNumber: number,
	overrides: Partial<PersistedSubmission<Move, Extensions>> = {},
): PersistedSubmission<Move, Extensions> => ({
	cycleNumber,
	actions: [{position: 2n ** 40n, color: 3}],
	secret: SECRET,
	committed: true,
	commitmentHash: `0x${cycleNumber.toString(16).padStart(48, '0')}`,
	...overrides,
});

describe('the submission storage, in the account data', () => {
	it('is not ready, and knows nothing, until the account data has loaded', async () => {
		const storage = controlledStorage();
		storage.hold();
		const {submissions, stop} = device(storage);
		try {
			expect(get(submissions.ready)).toBe(false);
			expect(submissions.load()).toBeUndefined();
			storage.release();
			await vi.waitFor(() => expect(get(submissions.ready)).toBe(true));
		} finally {
			stop();
		}
	});

	it("round-trips a game's actions through its codec, and a layer's record untouched and typed", async () => {
		const {submissions, accountData, stop} = device();
		try {
			await vi.waitFor(() => expect(get(submissions.ready)).toBe(true));
			submissions.save(
				turn(4, {
					revealScheduled: true,
					extensions: {fuzd: {slot: 'cycle_4', scheduledAt: 77}},
				}),
			);
			const loaded = submissions.load()!;
			expect(loaded).toEqual(
				turn(4, {
					revealScheduled: true,
					extensions: {fuzd: {slot: 'cycle_4', scheduledAt: 77}},
				}),
			);
			// NO CAST: the game reads its layer's namespace as that layer typed it.
			expectTypeOf(loaded.extensions).toEqualTypeOf<Extensions | undefined>();
			expectTypeOf(loaded.actions).toEqualTypeOf<readonly Move[]>();
			// What is stored is the game's encoding, under the chain, contract and
			// identity, in the account data's own field.
			const key = submissionKey({chainId: 1, contract: GAME, identity: TOKEN});
			expect(key).toBe(`1_${GAME}_5`);
			expect(accountData.read()!.submissions[key].turn!.actions).toEqual([
				[(2n ** 40n).toString(), 3],
			]);
		} finally {
			stop();
		}
	});

	it('writes a committed turn once, under its cycle and hash, and keeps it when the plan is cleared', async () => {
		const {submissions, accountData, stop} = device();
		try {
			await vi.waitFor(() => expect(get(submissions.ready)).toBe(true));
			const first = turn(4);
			submissions.save(first);
			// Never overwritten: the same key written again keeps the first record.
			submissions.save({...first, actions: [{position: 1n, color: 1}]});
			submissions.clear();

			expect(submissions.load()).toBeUndefined();
			expect(submissions.committedTurns(4)).toEqual([first]);
			const key = submissionKey({chainId: 1, contract: GAME, identity: TOKEN});
			expect(Object.keys(accountData.read()!.committedTurns)).toEqual([
				committedTurnKey(key, 4, first.commitmentHash),
			]);
		} finally {
			stop();
		}
	});

	it('keeps BOTH turns of a cycle two devices committed, apart, for the chain to decide', async () => {
		const {submissions, stop} = device();
		try {
			await vi.waitFor(() => expect(get(submissions.ready)).toBe(true));
			const laptop = turn(4, {commitmentHash: `0x${'aa'.repeat(24)}`});
			const phone = turn(4, {
				commitmentHash: `0x${'bb'.repeat(24)}`,
				actions: [{position: 9n, color: 1}],
			});
			submissions.save(laptop);
			submissions.save(phone);
			expect(submissions.committedTurns(4)).toHaveLength(2);
			expect(storedTurnsFor(submissions, 4)).toHaveLength(3);
			expect(submissions.committedTurns(5)).toEqual([]);
		} finally {
			stop();
		}
	});

	it('empties a plan rather than removing it, so a later plan from another device survives the merge', async () => {
		// A removed map item leaves a tombstone, and a tombstoned key drops every
		// later write at the next merge: a phone's next plan would vanish.
		const shared = watchableStorage();
		const laptop = device(shared, {now: 1000});
		const phoneStorage = controlledStorage();
		const phone = device(phoneStorage, {now: 1000});
		try {
			await vi.waitFor(() => expect(get(laptop.submissions.ready)).toBe(true));
			await vi.waitFor(() => expect(get(phone.submissions.ready)).toBe(true));

			laptop.submissions.save(turn(4, {committed: false}));
			laptop.submissions.clear();
			await laptop.accountData.get()!.persisted();

			phone.clockAt.now = 2000;
			phone.submissions.save(turn(5, {committed: false}));
			await phone.accountData.get()!.persisted();

			shared.deliver(
				storageKey(ALICE),
				phoneStorage.saved.get(storageKey(ALICE)),
			);
			await vi.waitFor(() =>
				expect(laptop.submissions.load()).toMatchObject({cycleNumber: 5}),
			);
		} finally {
			laptop.stop();
			phone.stop();
		}
	});

	it('says when a record arrives from another device', async () => {
		const shared = watchableStorage();
		const laptop = device(shared);
		const phoneStorage = controlledStorage();
		const phone = device(phoneStorage);
		try {
			await vi.waitFor(() => expect(get(laptop.submissions.ready)).toBe(true));
			await vi.waitFor(() => expect(get(phone.submissions.ready)).toBe(true));
			const heard: unknown[] = [];
			const unsubscribe = laptop.submissions.changes.subscribe((v) =>
				heard.push(v),
			);
			const before = heard.length;

			phone.submissions.save(turn(4));
			await phone.accountData.get()!.persisted();
			shared.deliver(
				storageKey(ALICE),
				phoneStorage.saved.get(storageKey(ALICE)),
			);
			await vi.waitFor(() => expect(heard.length).toBeGreaterThan(before));
			expect(laptop.submissions.committedTurns(4)).toEqual([turn(4)]);
			unsubscribe();
		} finally {
			laptop.stop();
			phone.stop();
		}
	});

	it('prunes committed turns once settled, keeping the latest few', async () => {
		const {submissions, stop} = device();
		try {
			await vi.waitFor(() => expect(get(submissions.ready)).toBe(true));
			for (const cycle of [1, 2, 3, 4, 5, 6]) submissions.save(turn(cycle));
			submissions.settled(2);
			// Settled up to 2, but 1 and 2 are pruned only beyond the latest few.
			const kept = [1, 2, 3, 4, 5, 6].filter(
				(cycle) => submissions.committedTurns(cycle).length > 0,
			);
			expect(COMMITTED_TURNS_KEPT).toBe(3);
			expect(kept).toEqual([3, 4, 5, 6]);
			submissions.settled(6);
			expect(
				[1, 2, 3, 4, 5, 6].filter(
					(cycle) => submissions.committedTurns(cycle).length > 0,
				),
			).toEqual([4, 5, 6]);
		} finally {
			stop();
		}
	});

	it('resolves a durable save once it is on storage, and rejects when it is not', async () => {
		const storage = controlledStorage();
		const {submissions, stop} = device(storage);
		try {
			await vi.waitFor(() => expect(get(submissions.ready)).toBe(true));
			await submissions.saveDurably(turn(4, {committed: false}));
			const stored = storage.saved.get(storageKey(ALICE)) as {
				data: {submissions: Record<string, {turn: {cycleNumber: number}}>};
			};
			expect(Object.values(stored.data.submissions)[0].turn.cycleNumber).toBe(
				4,
			);

			storage.saveError = new Error('quota exceeded');
			await expect(
				submissions.saveDurably(turn(5, {committed: false})),
			).rejects.toBeInstanceOf(AccountDataNotStoredError);
		} finally {
			stop();
		}
	});
});

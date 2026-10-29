/**
 * Where a submission is kept between page loads, for any action type: in the
 * ACCOUNT DATA (P8 b), so the secret, the actions and whatever a layer keeps
 * with the turn are synced and encrypted wherever the account data is, rather
 * than sitting in plain `localStorage` on one browser.
 *
 * The stake is real, so losing what is stored here costs the player money:
 * without the secret a commitment cannot be opened, and a missed reveal that
 * cannot be shown its chunks forfeits the whole bond. Everything here is
 * written with that in mind.
 *
 * TWO FIELDS, SPLIT BY WHAT THEY ARE WORTH (Q8-9). The account data merges a
 * map item by its timestamp, the later write winning, on device clocks:
 *
 * - `submissions` holds PLANS, one record per chain, contract and identity.
 *   The later write winning is harmless for a plan.
 * - `committedTurns` holds COMMITTED turns, keyed by identity, cycle AND
 *   commitment hash, written once at commit and never overwritten or cleared
 *   by the submission. Nothing ever competes for a key, so clock skew does not
 *   matter, and two devices that both committed in one cycle each keep their
 *   own record: the chain's commitment hash decides which is the turn.
 *
 * A committed turn is pruned once its cycle is revealed or settled on chain
 * (`settled`), keeping the latest few; there is no automatic expiry, because a
 * settlement shown the chunks may come weeks later.
 *
 * A PLAN IS NEVER REMOVED, ONLY EMPTIED. A removed map item leaves a tombstone
 * that outlives it (until the item's own `deleteAt`), and a tombstoned key
 * drops every later write to it at the next merge: removing the one key a plan
 * lives under would lose every later plan on every other device. So a cleared
 * plan is the record `{turn: null}`.
 *
 * THE KEYS AND THE RECORD ARE A WIRE (see `AGENTS.md`, "Commit-reveal
 * rules"): once a game has users, renaming a field, a key's shape, or the
 * game's action codec makes `load()` miss every record a previous build wrote.
 */
import {derived} from 'svelte/store';
import {defineSchema, map} from 'synqable';
import type {PersistedSubmission, SubmissionStorage} from '../submission';
import type {PlayerIdentity} from '../seams';
import type {AccountDataStore} from '$lib/account/AccountData';

/**
 * How one game writes its actions. A WIRE once the game has users: bigint has
 * no JSON representation, so a game whose action holds one writes it as a
 * string.
 */
export type SubmissionStorageFormat<TAction> = {
	encode: (action: TAction) => unknown;
	decode: (stored: unknown) => TAction;
};

/**
 * ONE TURN, AS STORED. Every field of `PersistedSubmission`, the actions in the
 * game's encoding and the extensions as the layers wrote them (JSON).
 */
export type StoredTurn = {
	cycleNumber: number;
	actions: readonly unknown[];
	secret: `0x${string}`;
	committed: boolean;
	commitmentHash?: `0x${string}`;
	revealScheduled?: boolean;
	extensions?: Readonly<Record<string, unknown>>;
};

/** A plan's slot: the plan, or `null` once cleared (never removed). */
export type StoredPlan = {turn: StoredTurn | null};

/**
 * The two fields the commit-reveal framework adds to the account data, beside
 * `operations`, through `createAccountData({fields})`. Typed through
 * `defineSchema`, so the account data's type carries them.
 */
export const SUBMISSION_FIELDS = {
	schema: defineSchema({
		submissions: map<StoredPlan>(),
		committedTurns: map<StoredTurn>(),
	}),
	defaults: () => ({submissions: {}, committedTurns: {}}),
};
export type SubmissionFields = typeof SUBMISSION_FIELDS.schema;

/** The account data with the submission's fields. */
export type SubmissionAccountData = Pick<
	AccountDataStore<SubmissionFields>,
	'lifecycle$' | 'read' | 'writer' | 'writeDurably' | 'watchField'
>;

/** No automatic expiry: see the file comment. */
const NEVER = Number.MAX_SAFE_INTEGER;

/** How many committed turns are kept, settled or not, per identity. */
export const COMMITTED_TURNS_KEPT = 3;

/**
 * Scoped to chain + contract + WHO PLAYS.
 *
 * Scoped so that switching network or deployment cannot surface someone
 * else's pending submission. The last part is the identity rather than the
 * account, which is the whole difference between one pending submission per
 * account and one per thing the account plays with.
 */
export function submissionKey<TIdentity extends PlayerIdentity>(params: {
	chainId: string | number;
	contract: string;
	identity: TIdentity;
}): string {
	return `${params.chainId}_${params.contract}_${params.identity}`.toLowerCase();
}

/** A committed turn's key: the submission's, its cycle, and its hash. */
export function committedTurnKey(
	key: string,
	cycleNumber: number,
	commitmentHash: string | undefined,
): string {
	return `${key}_${cycleNumber}_${commitmentHash ?? 'unknown'}`.toLowerCase();
}

/**
 * The submission storage of one identity, in the account data.
 *
 * Synchronous over a store that loads asynchronously: `ready` says when what
 * it answers is real (the account data's lifecycle), and the submission waits
 * on it (Q8-1). Before ready, `load` answers `undefined` and writes are
 * dropped, which the submission never asks for.
 */
export function createAccountDataSubmissionStorage<
	TAction,
	TExtensions extends object = {},
	TIdentity extends PlayerIdentity = PlayerIdentity,
>(params: {
	accountData: SubmissionAccountData;
	format: SubmissionStorageFormat<TAction>;
	chainId: string | number;
	contract: `0x${string}`;
	identity: TIdentity;
}): AccountDataSubmissionStorage<TAction, TExtensions> {
	const {accountData, format} = params;
	const key = submissionKey(params);
	const committedPrefix = `${key}_`;
	type Persisted = PersistedSubmission<TAction, TExtensions>;
	type Writer = NonNullable<ReturnType<SubmissionAccountData['writer']>>;

	function encode(submission: Persisted): StoredTurn {
		return {
			cycleNumber: submission.cycleNumber,
			actions: submission.actions.map(format.encode),
			secret: submission.secret,
			committed: submission.committed,
			...(submission.commitmentHash
				? {commitmentHash: submission.commitmentHash}
				: {}),
			...(submission.revealScheduled === undefined
				? {}
				: {revealScheduled: submission.revealScheduled}),
			...(submission.extensions
				? {extensions: submission.extensions as Record<string, unknown>}
				: {}),
		};
	}

	function decode(
		stored: StoredTurn | null | undefined,
	): Persisted | undefined {
		if (
			!stored ||
			typeof stored.cycleNumber !== 'number' ||
			!Array.isArray(stored.actions) ||
			typeof stored.secret !== 'string'
		) {
			return undefined;
		}
		try {
			return {
				cycleNumber: stored.cycleNumber,
				actions: stored.actions.map(format.decode),
				secret: stored.secret,
				committed: !!stored.committed,
				...(stored.commitmentHash
					? {commitmentHash: stored.commitmentHash}
					: {}),
				...(stored.revealScheduled === undefined
					? {}
					: {revealScheduled: stored.revealScheduled}),
				// ROUND-TRIPPED UNTOUCHED: the framework stores what the layers
				// wrote and hands it back typed as the game composed it.
				...(stored.extensions
					? {extensions: stored.extensions as TExtensions}
					: {}),
			};
		} catch {
			// A record this build cannot decode is as good as absent, and
			// throwing here would break the whole game.
			return undefined;
		}
	}

	/** What a save writes: the plan's slot, and a committed turn once. */
	function write(writer: Writer, submission: Persisted) {
		const stored = encode(submission);
		writer.addItem('submissions', key, {turn: stored}, {deleteAt: NEVER});
		if (submission.committed) {
			const turnKey = committedTurnKey(
				key,
				submission.cycleNumber,
				submission.commitmentHash,
			);
			// WRITTEN ONCE, never overwritten: see the file comment.
			if (!writer.read().committedTurns[turnKey]) {
				writer.addItem('committedTurns', turnKey, stored, {deleteAt: NEVER});
			}
		}
	}

	function committedTurnsOf(cycleNumber?: number): [string, Persisted][] {
		const turns = accountData.read()?.committedTurns ?? {};
		const found: [string, Persisted][] = [];
		for (const [turnKey, stored] of Object.entries(turns)) {
			if (!turnKey.startsWith(committedPrefix)) continue;
			const turn = decode(stored);
			if (!turn) continue;
			if (cycleNumber !== undefined && turn.cycleNumber !== cycleNumber) {
				continue;
			}
			found.push([turnKey, turn]);
		}
		return found;
	}

	const ready = derived(
		accountData.lifecycle$,
		($lifecycle) => $lifecycle.status === 'ready',
	);

	// Any change to either field, a merge from another device or tab included.
	const changes = derived(
		[
			accountData.watchField('submissions'),
			accountData.watchField('committedTurns'),
		],
		([$submissions, $committed]) => [$submissions[key], $committed] as const,
	);

	return {
		ready,
		changes,

		load() {
			return decode(accountData.read()?.submissions[key]?.turn);
		},

		save(submission) {
			const writer = accountData.writer();
			if (!writer) return;
			write(writer, submission);
		},

		async saveDurably(submission) {
			await accountData.writeDurably((writer) => write(writer, submission));
		},

		clear() {
			const writer = accountData.writer();
			if (!writer || !writer.read().submissions[key]?.turn) return;
			writer.addItem('submissions', key, {turn: null}, {deleteAt: NEVER});
		},

		committedTurns(cycleNumber) {
			return committedTurnsOf(cycleNumber).map(([, turn]) => turn);
		},

		settled(cycleNumber) {
			const writer = accountData.writer();
			if (!writer) return;
			const all = committedTurnsOf().sort(
				([, a], [, b]) => b.cycleNumber - a.cycleNumber,
			);
			for (const [turnKey, turn] of all.slice(COMMITTED_TURNS_KEPT)) {
				if (turn.cycleNumber <= cycleNumber) {
					writer.removeItem('committedTurns', turnKey, {ignoreMissing: true});
				}
			}
		},
	};
}

/** What the account-data storage offers beyond the submission's port. */
export type AccountDataSubmissionStorage<
	TAction,
	TExtensions extends object = {},
> = SubmissionStorage<TAction, TExtensions> &
	Required<
		Pick<
			SubmissionStorage<TAction, TExtensions>,
			'ready' | 'saveDurably' | 'changes' | 'committedTurns' | 'settled'
		>
	>;

/** A storage that keeps nothing, for SSR and for a disconnected player. */
export function noSubmissionStorage<
	TAction,
	TExtensions extends object = {},
>(): SubmissionStorage<TAction, TExtensions> {
	return {load: () => undefined, save: () => {}, clear: () => {}};
}

/** Every committed turn stored for a cycle and its plan, for a settlement. */
export function storedTurnsFor<TAction, TExtensions extends object>(
	storage: SubmissionStorage<TAction, TExtensions>,
	cycleNumber: number,
): PersistedSubmission<TAction, TExtensions>[] {
	const turns = [...(storage.committedTurns?.(cycleNumber) ?? [])];
	// A plan whose commit went out but whose committed record was never
	// written (the tab closed between the two) still holds the secret.
	const plan = storage.load();
	if (plan && plan.cycleNumber === cycleNumber) turns.push(plan);
	return turns;
}

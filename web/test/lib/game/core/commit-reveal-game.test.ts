import {describe, it, expect, vi} from 'vitest';
import {get, readable, writable, type Readable} from 'svelte/store';
import {
	canTakeTurnNow,
	createCommitRevealGame,
	onEachNewCycle,
	setupNeeded,
	signWithLocalSigner,
} from '$lib/game/core/commit-reveal-game';
import type {CoreServices} from '$lib/context/core';
import type {DelegationValue} from '$lib/onchain/delegation';
import type {OnchainStateStore} from '$lib/game/core/seams';
import type {AccountDataLifecycle} from '$lib/account/lifecycle';
import * as submissionModule from '$lib/game/core/submission';
import type {SubmissionStorage} from '$lib/game/core/submission';

// The skeleton's wiring into the submission is observed at the call: what it
// hands `createSubmission` is the whole of what a game can choose there.
vi.mock('$lib/game/core/submission', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('$lib/game/core/submission')>();
	return {...actual, createSubmission: vi.fn(actual.createSubmission)};
});

/**
 * The skeleton is WIRING: which store asks what of the chain, and when. Most of
 * it is runtime behaviour the e2e suite plays through; what is pinned here is
 * the part a game can get wrong without any suite noticing, because nothing
 * fails, the player just stops being told something.
 */

const ACCOUNT = '0x1111111111111111111111111111111111111111' as const;
const authorised: DelegationValue = {
	step: 'Loaded',
	allowed: true,
	withdrawn: false,
};
const notAuthorised: DelegationValue = {
	step: 'Loaded',
	allowed: false,
	withdrawn: false,
};

describe('the setup gate, framework half', () => {
	it('asks to sign in before anything, even before the game', () => {
		expect(
			setupNeeded({
				account: undefined,
				delegation: notAuthorised,
				stake: {step: 'stake'},
			}),
		).toEqual({step: 'sign-in'});
	});

	it("puts the game's stake step BEFORE the authorisation", () => {
		// Acquiring a stake carries the authorisation with it, so asking to
		// authorise first demands a transaction the next step includes.
		expect(
			setupNeeded({
				account: ACCOUNT,
				delegation: notAuthorised,
				stake: {step: 'deposit'},
			}),
		).toEqual({step: 'deposit'});
	});

	it('asks to authorise once the stake is there', () => {
		expect(
			setupNeeded({
				account: ACCOUNT,
				delegation: notAuthorised,
				stake: undefined,
			}),
		).toEqual({step: 'authorise'});
	});

	it('does not ask while the delegation is still being read', () => {
		expect(
			setupNeeded({
				account: ACCOUNT,
				delegation: {step: 'Unloaded'} as DelegationValue,
				stake: undefined,
			}),
		).toBeUndefined();
	});

	it('gets out of the way once everything is done', () => {
		expect(
			setupNeeded({account: ACCOUNT, delegation: authorised, stake: undefined}),
		).toBeUndefined();
	});
});

describe('whether a turn can be taken now', () => {
	it('never while setup is pending', () => {
		expect(
			canTakeTurnNow({
				setup: {step: 'sign-in'},
				phase: 'play',
				onlyInPlayPhase: false,
			}),
		).toBe(false);
	});

	it('in any phase, for a game that did not ask otherwise', () => {
		expect(
			canTakeTurnNow({
				setup: undefined,
				phase: 'reveal',
				onlyInPlayPhase: false,
			}),
		).toBe(true);
	});

	it('only in the play phase, for a game that asked', () => {
		expect(
			canTakeTurnNow({setup: undefined, phase: 'play', onlyInPlayPhase: true}),
		).toBe(true);
		for (const phase of ['commit', 'reveal', 'catching-up'] as const) {
			expect(
				canTakeTurnNow({setup: undefined, phase, onlyInPlayPhase: true}),
			).toBe(false);
		}
	});
});

describe('once per cycle', () => {
	it('runs on a turnover, not on the first reading and not on every tick', () => {
		const cycleInfo = writable({currentCycleNumber: 4});
		const run = vi.fn();
		const stop = onEachNewCycle({cycleInfo, run});
		expect(run).not.toHaveBeenCalled();

		// The clock re-emits the same cycle every tick.
		cycleInfo.set({currentCycleNumber: 4});
		expect(run).not.toHaveBeenCalled();

		cycleInfo.set({currentCycleNumber: 5});
		expect(run).toHaveBeenCalledOnce();

		stop();
		cycleInfo.set({currentCycleNumber: 6});
		expect(run).toHaveBeenCalledOnce();
	});
});

describe('the secret signer', () => {
	it('refuses rather than falling back to a random secret', async () => {
		const sign = signWithLocalSigner(
			readable({
				status: 'not-ready',
			}) as unknown as CoreServices['signerExecutor'],
		);
		await expect(sign('message')).rejects.toThrow(/no local signer/);
	});

	it('signs with the signer account, without a prompt', async () => {
		const signMessage = vi.fn(async () => '0xsigned' as const);
		const sign = signWithLocalSigner(
			readable({
				status: 'ready',
				account: {signMessage},
			}) as unknown as CoreServices['signerExecutor'],
		);
		await expect(sign('hello')).resolves.toBe('0xsigned');
		expect(signMessage).toHaveBeenCalledWith({message: 'hello'});
	});
});

// ---------------------------------------------------------------------------
// The composition itself, on fakes. Off-browser, so nothing here starts IO of
// its own: the chain clock and the trackers stay inert, which is what lets the
// wiring be observed one trigger at a time.
// ---------------------------------------------------------------------------

type Board = {cycleNumber: number; cells: number};

type TestGame = {
	identity: `0x${string}`;
	action: number;
	board: Board;
	view: {cells: number};
	planning: {plan: Readable<number[]>; toggle: (n: number) => void};
	missedReveal: {
		value: {blocks: boolean};
		check: () => Promise<void>;
		commitment: Readable<undefined>;
	};
	stake: {step: 'stake'};
	surface: unknown;
};

function compose(
	overrides: {
		stake?: {step: 'stake'} | undefined;
		submission?: Parameters<
			typeof createCommitRevealGame<TestGame>
		>[1]['submission'];
		scheduler?: Parameters<
			typeof createCommitRevealGame<TestGame>
		>[1]['scheduler'];
		lifecycle?: AccountDataLifecycle;
		storage?: SubmissionStorage<number>;
	} = {},
) {
	const lifecycle = writable<AccountDataLifecycle>(
		overrides.lifecycle ?? {status: 'ready', account: ACCOUNT},
	);
	const account = writable<`0x${string}` | undefined>(ACCOUNT);
	const identity = writable<`0x${string}` | undefined>(ACCOUNT);
	const delegation = writable<DelegationValue>(authorised);
	const core = {
		account,
		delegation,
		deployments: {get: () => ({chain: {id: 31337}})},
		publicClient: {},
		signerExecutor: readable({status: 'not-ready'}),
		signerBalance: writable({step: 'Unloaded'}),
		accountData: {watchField: () => readable({}), lifecycle$: lifecycle},
	} as unknown as CoreServices;

	const board = writable({step: 'Loaded', cycleNumber: 0, cells: 0});
	const boardStore = {
		subscribe: board.subscribe,
		status: readable({}),
		update: vi.fn(async () => {}),
	} as unknown as OnchainStateStore<Board>;

	const check = vi.fn(async () => {});
	const refresh = vi.fn();
	const toggle = vi.fn();
	const stopGame = vi.fn();
	const startGame = vi.fn(() => stopGame);

	const crg = createCommitRevealGame<TestGame>(core, {
		identity,
		contract: '0x2222222222222222222222222222222222222222',
		cycle: {
			config: {
				policy: 'timed',
				startTime: 0,
				commitPhaseDuration: 100,
				revealPhaseDuration: 50,
				commitTimeAllowance: 0,
			},
			readCycle: async () => {
				throw new Error('a timed cycle reads nothing');
			},
			readAttendance: async () => ({waitedFor: 0, committed: 0, revealed: 0}),
			advance: async () => {},
			contractIsTheJudge: true,
		},
		camera: {
			initialVisible: {x: 0, y: 0, width: 10, height: 10},
			limits: {},
		} as never,
		board: () => boardStore,
		missedReveal: () => ({
			value: {blocks: false},
			check,
			commitment: readable(undefined),
		}),
		blocksCommitting: (value) => value.blocks,
		adapter: () =>
			({
				commit: async () => {},
				reveal: async () => {},
			}) as never,
		buildCommitment: () => ({hash: '0x'}),
		storageFor: () =>
			overrides.storage ?? {
				load: () => undefined,
				save: () => {},
				clear: () => {},
			},
		isOutOfGas: () => false,
		...(overrides.submission ? {submission: overrides.submission} : {}),
		...(overrides.scheduler ? {scheduler: overrides.scheduler} : {}),
		stake: {
			refresh,
			needed: readable('stake' in overrides ? overrides.stake : undefined),
			acquisition: {
				address: '0x2222222222222222222222222222222222222222',
				functionName: 'acquire',
			} as never,
			grant: {action: 'test'},
		},
		planning: () => ({plan: readable([]), toggle}),
		hold: ({latest}) => latest,
		holdPlan: ({plan}) => plan,
		merge: ({onchain}) => ({cells: onchain.cells}),
		renderer: () => ({}) as never,
		click: (position, {planning}) => planning.toggle(position.x),
		start: startGame,
	});
	return {crg, identity, check, toggle, startGame, stopGame, lifecycle};
}

describe('the skeleton, wired', () => {
	it("asks about a missed reveal on start and on every identity change, and starts and stops the game's own IO", () => {
		const {crg, identity, check, startGame, stopGame} = compose();
		const stop = crg.start();
		// Once on start, once for the identity subscription's first reading.
		const onStart = check.mock.calls.length;
		expect(onStart).toBeGreaterThanOrEqual(1);
		expect(startGame).toHaveBeenCalledOnce();

		identity.set('0x3333333333333333333333333333333333333333');
		expect(check.mock.calls.length).toBe(onStart + 1);

		stop();
		expect(stopGame).toHaveBeenCalledOnce();
		identity.set(ACCOUNT);
		expect(check.mock.calls.length).toBe(onStart + 1);
	});

	it('hands a click to the game only once the player could commit it', () => {
		const ready = compose();
		const stopReady = ready.crg.start();
		ready.crg.render.eventEmitter.emit('clicked', {x: 7, y: 1});
		expect(ready.toggle).toHaveBeenCalledWith(7);
		stopReady();

		const notReady = compose({stake: {step: 'stake'}});
		const stopNotReady = notReady.crg.start();
		expect(get(notReady.crg.game.setup)).toEqual({step: 'stake'});
		notReady.crg.render.eventEmitter.emit('clicked', {x: 7, y: 1});
		expect(notReady.toggle).not.toHaveBeenCalled();
		stopNotReady();
	});

	it("hands the game's reveal mode to the submission, and today's when it chose none", () => {
		const createSubmission = vi.mocked(submissionModule.createSubmission);

		createSubmission.mockClear();
		compose({submission: {autoReveal: 'fallback', fallbackRevealAfter: 0.25}});
		expect(createSubmission).toHaveBeenCalledOnce();
		expect(createSubmission.mock.calls[0][0]).toMatchObject({
			autoReveal: 'fallback',
			fallbackRevealAfter: 0.25,
		});

		// Nothing chosen: nothing passed, so the submission's own defaults
		// (`immediately`, half the phase) are what runs, as before.
		createSubmission.mockClear();
		compose();
		const params = createSubmission.mock.calls[0][0];
		expect(params.autoReveal).toBeUndefined();
		expect(params.fallbackRevealAfter).toBeUndefined();
	});

	it("hands the game's reveal scheduler to the submission", () => {
		const createSubmission = vi.mocked(submissionModule.createSubmission);
		const scheduler = {
			prepare: async () => ({payee: ACCOUNT, value: 0n}),
			submit: async () => {},
		};
		createSubmission.mockClear();
		compose({scheduler});
		expect(createSubmission.mock.calls[0][0].scheduler).toBe(scheduler);

		createSubmission.mockClear();
		compose();
		expect(createSubmission.mock.calls[0][0].scheduler).toBeUndefined();
	});

	it('blocks play while the saved turn loads, and on a load error, never showing an empty turn', () => {
		const {crg, lifecycle, toggle} = compose({
			lifecycle: {status: 'loading', account: ACCOUNT},
		});
		const stop = crg.start();
		const states: unknown[] = [];
		const unsubscribe = crg.game.savedTurn.subscribe((v) => states.push(v));

		expect(get(crg.game.savedTurn)).toEqual({status: 'loading'});
		expect(get(crg.game.readyToPlay)).toBe(false);
		crg.render.eventEmitter.emit('clicked', {x: 7, y: 1});
		expect(toggle).not.toHaveBeenCalled();
		// The rest of the app is not blocked: the setup gate still answers.
		expect(get(crg.game.setup)).toBeUndefined();

		const error = new Error('could not decrypt');
		lifecycle.set({status: 'error', account: ACCOUNT, error});
		expect(get(crg.game.savedTurn)).toEqual({status: 'error', error});
		expect(get(crg.game.readyToPlay)).toBe(false);

		lifecycle.set({status: 'ready', account: ACCOUNT});
		expect(get(crg.game.savedTurn)).toEqual({status: 'ready'});
		expect(get(crg.game.readyToPlay)).toBe(true);
		crg.render.eventEmitter.emit('clicked', {x: 7, y: 1});
		expect(toggle).toHaveBeenCalledWith(7);

		unsubscribe();
		stop();
	});

	it("follows the identity's storage readiness, and passes the durable write through", async () => {
		const ready = writable(false);
		const saved: unknown[] = [];
		const createSubmission = vi.mocked(submissionModule.createSubmission);
		createSubmission.mockClear();
		const {identity} = compose({
			storage: {
				load: () => undefined,
				save: () => {},
				clear: () => {},
				ready,
				saveDurably: async (s) => void saved.push(s),
			},
		});
		const storage = createSubmission.mock.calls[0][0].storage;
		const seen: boolean[] = [];
		const unsubscribe = storage.ready!.subscribe((v) => seen.push(v));
		ready.set(true);
		expect(seen).toEqual([false, true]);
		ready.set(false);
		expect(seen.at(-1)).toBe(false);
		// Nobody playing: nothing to load, so nothing to wait for.
		identity.set(undefined);
		expect(seen.at(-1)).toBe(true);
		unsubscribe();

		identity.set(ACCOUNT);
		await storage.saveDurably!({
			cycleNumber: 1,
			actions: [],
			secret: '0x01',
			committed: false,
		});
		expect(saved).toHaveLength(1);
	});

	it('shows the board through the held store and the game merge', () => {
		const {crg} = compose();
		const stop = crg.start();
		const unsubscribe = crg.viewState.subscribe(() => {});
		expect(get(crg.viewState)).toEqual({
			step: 'Loaded',
			cycleNumber: 0,
			cells: 0,
		});
		unsubscribe();
		stop();
	});
});

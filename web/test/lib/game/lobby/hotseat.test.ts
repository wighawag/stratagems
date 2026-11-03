import {describe, it, expect, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import type {AccountDataLifecycle} from '$lib/account/lifecycle';
import {
	createHotseat,
	signInAs,
	type HotseatChainView,
	type HotseatHuman,
} from '$lib/game/lobby/hotseat';

/**
 * THE HANDOVER, with the chain, the switch and the revealer as fakes: what is
 * pinned is whose turn it is (read from the chain, in seat order), that the
 * game is never shown to anybody but the person who pressed, and that a turn
 * the revealer lost is revealed behind the covering screen. The switch itself
 * is jolly-roger's `wallet-switch.svelte.test.ts`; the whole of it, in a
 * browser, is `e2e/tests/offline-hotseat.e2e.ts`.
 */

const HUMANS: HotseatHuman[] = [
	{
		address: '0x00000000000000000000000000000000000000a1',
		player: 1n,
		label: 'Player 1',
	},
	{
		address: '0x00000000000000000000000000000000000000a2',
		player: 2n,
		label: 'Player 2',
	},
	{
		address: '0x00000000000000000000000000000000000000a3',
		player: 3n,
		label: 'Player 3',
	},
];

function fakeWorld(view: HotseatChainView, humans = HUMANS) {
	const switched: `0x${string}`[] = [];
	const held = new Set<string>();
	const signedIn = writable<string | undefined>(undefined);
	const lifecycle$ = writable<AccountDataLifecycle>({status: 'no-account'});
	/** Whether a switch finds the account's data loaded at once (a fast load). */
	const loads = {instantly: true};
	const submission = Object.assign(writable<{step: string}>({step: 'Idle'}), {
		reveal: vi.fn(async () => {}),
	});
	const hotseat = createHotseat({
		humans,
		switchTo: async (address) => {
			switched.push(address);
			signedIn.set(address);
			lifecycle$.set({
				status: loads.instantly ? 'ready' : 'loading',
				account: address,
			});
		},
		read: async () => view,
		revealer: {holds: (player, cycle) => held.has(`${cycle}:${player}`)},
		submission,
		signedIn,
		accountData: {lifecycle$},
	});
	return {
		hotseat,
		view,
		switched,
		held,
		submission,
		signedIn,
		lifecycle$,
		loads,
	};
}

const commitPhase = (outstanding: boolean[]): HotseatChainView => ({
	cycleNumber: 5,
	commiting: true,
	outstanding,
});

describe('a hotseat', () => {
	it('is inactive with one person, so the game is shown as before', async () => {
		const {hotseat} = fakeWorld(commitPhase([false]), HUMANS.slice(0, 1));
		await hotseat.check();
		expect(get(hotseat)).toEqual({step: 'Inactive'});
	});

	it('opens on the handover, never on a plan, and to the first person still to commit', async () => {
		const {hotseat, switched} = fakeWorld(commitPhase([true, false, false]));
		expect(get(hotseat).step).toBe('Opening');
		await hotseat.check();
		// A reload after Player 1 committed resumes at Player 2, and switches
		// nobody until they press.
		expect(get(hotseat)).toEqual({step: 'Passing', to: 1, label: 'Player 2'});
		expect(switched).toEqual([]);
	});

	it('switches to the person who pressed, and only then shows the game', async () => {
		const {hotseat, switched} = fakeWorld(commitPhase([false, false, false]));
		await hotseat.check();
		await hotseat.begin();
		expect(switched).toEqual([HUMANS[0].address]);
		expect(get(hotseat)).toEqual({step: 'Playing', seat: 0, label: 'Player 1'});
	});

	it('passes the device on once the person playing has committed, skipping anyone who already has', async () => {
		const {hotseat, view} = fakeWorld(commitPhase([false, false, true]));
		await hotseat.check();
		await hotseat.begin();
		// Still Player 1's turn while they have not committed.
		await hotseat.check();
		expect(get(hotseat).step).toBe('Playing');

		view.outstanding = [true, false, true];
		await hotseat.check();
		expect(get(hotseat)).toEqual({step: 'Passing', to: 1, label: 'Player 2'});

		await hotseat.begin();
		view.outstanding = [true, true, true];
		await hotseat.check();
		expect(get(hotseat)).toEqual({step: 'Resolving'});
	});

	it('covers the board through the reveal phase, and passes to the first person when the next cycle opens', async () => {
		const {hotseat, view, held} = fakeWorld(commitPhase([true, true, true]));
		for (const human of HUMANS) held.add(`5:${human.player}`);
		await hotseat.check();
		expect(get(hotseat).step).toBe('Resolving');

		view.commiting = false;
		await hotseat.check();
		expect(get(hotseat).step).toBe('Resolving');

		view.cycleNumber = 6;
		view.commiting = true;
		view.outstanding = [false, false, false];
		await hotseat.check();
		expect(get(hotseat)).toEqual({step: 'Passing', to: 0, label: 'Player 1'});
	});

	it('reveals, behind the screen, a turn the revealer does not hold (a reload lost it)', async () => {
		const {hotseat, view, held, switched, submission} = fakeWorld({
			cycleNumber: 5,
			commiting: false,
			outstanding: [true, true, false],
		});
		// Player 1's turn is held; Player 2's was handed over before a reload.
		held.add('5:1');
		submission.set({step: 'Committed'});
		await hotseat.check();

		expect(get(hotseat).step).toBe('Resolving');
		expect(switched).toEqual([HUMANS[1].address]);
		expect(submission.reveal).toHaveBeenCalledTimes(1);

		// Tried once per person and cycle, not in a loop.
		await hotseat.check();
		expect(submission.reveal).toHaveBeenCalledTimes(1);
		void view;
	});

	it('covers the game the moment the connection is somebody else, and puts the account back', async () => {
		// Measured: a connection's auto-connect, started when the page loaded
		// with the previous person stored, landed after a later switch.
		const {hotseat, switched, signedIn} = fakeWorld(
			commitPhase([false, false, false]),
		);
		await hotseat.check();
		await hotseat.begin();
		expect(get(hotseat).step).toBe('Playing');

		signedIn.set(HUMANS[1].address);
		// Covered in the same update, before anything could render the turn.
		expect(get(hotseat)).toEqual({step: 'Switching', to: 0, label: 'Player 1'});
		await hotseat.check();
		expect(switched.at(-1)).toBe(HUMANS[0].address);
		expect(get(hotseat).step).toBe('Playing');
	});

	it('keeps the game covered until the account data of the person with the device has loaded', async () => {
		// After a switch the submission reads `Idle` and drops a plan until the
		// new account's data has loaded: a board shown then ignores clicks.
		const {hotseat, lifecycle$, loads} = fakeWorld(
			commitPhase([false, false, false]),
		);
		loads.instantly = false;
		await hotseat.check();
		await hotseat.begin();
		expect(get(hotseat)).toEqual({step: 'Switching', to: 0, label: 'Player 1'});

		// The PREVIOUS person's data, still ready, is not this person's.
		lifecycle$.set({status: 'ready', account: HUMANS[1].address});
		expect(get(hotseat).step).toBe('Switching');

		lifecycle$.set({status: 'ready', account: HUMANS[0].address});
		expect(get(hotseat)).toEqual({step: 'Playing', seat: 0, label: 'Player 1'});
	});

	it('shows the game when the account data failed to load, so the game can say so', async () => {
		const {hotseat, lifecycle$, loads} = fakeWorld(
			commitPhase([false, false, false]),
		);
		loads.instantly = false;
		await hotseat.check();
		await hotseat.begin();
		lifecycle$.set({
			status: 'error',
			account: HUMANS[0].address,
			error: new Error('unreadable'),
		});
		expect(get(hotseat).step).toBe('Playing');
	});

	it('does not move the device while a press is being handled', async () => {
		let release = () => {};
		const switched: string[] = [];
		const signedIn = writable<string | undefined>(undefined);
		const view = commitPhase([false, false, false]);
		const hotseat = createHotseat({
			humans: HUMANS,
			switchTo: (address) =>
				new Promise<void>((resolve) => {
					switched.push(address);
					release = () => {
						signedIn.set(address);
						resolve();
					};
				}),
			read: async () => view,
			revealer: {holds: () => true},
			submission: Object.assign(writable({step: 'Idle'}), {
				reveal: async () => {},
			}),
			signedIn,
			accountData: {
				lifecycle$: writable<AccountDataLifecycle>({
					status: 'ready',
					account: HUMANS[0].address,
				}),
			},
		});
		await hotseat.check();
		const pressed = hotseat.begin();
		expect(get(hotseat).step).toBe('Switching');
		await hotseat.begin();
		view.outstanding = [true, false, false];
		await hotseat.check();
		expect(get(hotseat).step).toBe('Switching');
		release();
		await pressed;
		expect(switched).toHaveLength(1);
		expect(get(hotseat).step).toBe('Playing');
	});
});

describe('signing in as another person', () => {
	function fakeConnection() {
		const state = writable<{
			step: string;
			mechanism?: {address?: string};
			account?: {address?: string};
		}>({
			step: 'SignedIn',
			mechanism: {address: HUMANS[0].address},
			account: {address: HUMANS[0].address},
		});
		const requestSignature = vi.fn(async () => {
			const now = get(state);
			state.set({
				...now,
				step: 'SignedIn',
				account: {address: now.mechanism?.address},
			});
		});
		const connection = Object.assign(state, {
			targetStep: 'SignedIn',
			requestSignature,
		});
		// The wallet's selection, followed by the connection as the world's is
		// (`useCurrentAccount: 'always'`): it reconnects and stops before the
		// signature.
		const select = (address: `0x${string}`) =>
			queueMicrotask(() =>
				state.set({step: 'WalletConnected', mechanism: {address}}),
			);
		return {connection, select, requestSignature};
	}

	it('selects the account, waits for the connection to follow, then signs', async () => {
		const {connection, select, requestSignature} = fakeConnection();
		await signInAs({
			connection: connection as never,
			select,
			address: HUMANS[1].address,
		});
		expect(requestSignature).toHaveBeenCalledTimes(1);
		expect(get(connection).account?.address).toBe(HUMANS[1].address);
	});

	it('does nothing for the person already signed in', async () => {
		const {connection, requestSignature} = fakeConnection();
		const select = vi.fn();
		await signInAs({
			connection: connection as never,
			select,
			address: HUMANS[0].address,
		});
		expect(select).not.toHaveBeenCalled();
		expect(requestSignature).not.toHaveBeenCalled();
	});
});

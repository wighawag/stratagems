import {describe, expect, it, vi} from 'vitest';
import {writable} from 'svelte/store';
import {
	createAcquisition,
	findPendingAcquisition,
	refreshWhenPendingAcquisitionSettles,
	resolveAcquisitionState,
	type Acquisition,
	type AcquisitionDeps,
	type AcquisitionState,
} from '$lib/game/acquire';
import type {OnchainOperation} from '$lib/account/AccountData';

/**
 * An acquisition that outlived its tab.
 *
 * The failure this is all about: reload while the transaction is in flight, and
 * the setup gate goes back to offering the thing to someone whose money is
 * already spent. Depending on the game the second attempt does not collide with
 * the first at all - it buys another one and charges again.
 */

const SALE = '0x00000000000000000000000000000000000000fe' as const;
const OTHER = '0x00000000000000000000000000000000000000ff' as const;

function operation(overrides: {
	to?: `0x${string}` | null;
	functionName?: string;
	unknownMetadata?: boolean;
	state?: {inclusion: string; outcome?: string; final?: boolean};
	hash?: `0x${string}`;
}): OnchainOperation {
	const metadata = overrides.unknownMetadata
		? {type: 'unknown' as const, name: 'topUp', data: []}
		: {
				type: 'functionCall' as const,
				functionName: overrides.functionName ?? 'purchase',
				args: [],
			};
	return {
		// Metadata is only what the transaction MEANS now; what was asked lives
		// in `call`, and each broadcast in `attempts`.
		metadata,
		call: {to: overrides.to === undefined ? SALE : overrides.to},
		attempts: [{hash: overrides.hash ?? '0xabc'}],
		state: overrides.state,
	} as unknown as OnchainOperation;
}

/** One that was stuck, replaced, and whose REPLACEMENT is what landed. */
function replacedOperation() {
	return {
		metadata: {
			type: 'functionCall' as const,
			functionName: 'purchase',
			args: [],
		},
		call: {to: SALE},
		attempts: [{hash: '0xfirst'}, {hash: '0xreplacement'}],
		state: {
			inclusion: 'Included',
			outcome: 'Success',
			final: false,
			via: {kind: 'attempt', attemptIndex: 1},
		},
	} as unknown as OnchainOperation;
}

const find = (operations: Record<string, OnchainOperation>) =>
	findPendingAcquisition({
		operations,
		contract: SALE,
		functionName: 'purchase',
	});

describe('finding an acquisition in the operations ledger', () => {
	it('finds one that is still in the mempool', () => {
		const found = find({'100': operation({state: {inclusion: 'InMemPool'}})});
		expect(found?.id).toBe('100');
		expect(found?.landed).toBe(false);
	});

	it('finds one that has not been given a state yet', () => {
		// The window this exists for is the narrowest one: broadcast, and the tab
		// closed before the observer said anything about it.
		expect(find({'100': operation({})})?.id).toBe('100');
	});

	it('finds one that landed but is not final, and says so', () => {
		// What was bought exists on chain from this moment; what is left is the
		// ledger retiring the operation. Different sentence to the player, same
		// refusal to sell them a second one.
		const found = find({
			'100': operation({
				state: {inclusion: 'Included', outcome: 'Success', final: false},
			}),
		});
		expect(found?.landed).toBe(true);
	});

	it('does not count one that reverted', () => {
		// It charged gas and delivered nothing, so the player has to be able to
		// try again. Treating it as pending would lock them out of the game with a
		// spinner.
		expect(
			find({
				'100': operation({
					state: {inclusion: 'Included', outcome: 'Failure', final: true},
				}),
			}),
		).toBeUndefined();
	});

	it('does not count one the chain never took', () => {
		expect(
			find({'100': operation({state: {inclusion: 'Dropped'}})}),
		).toBeUndefined();
		expect(
			find({'101': operation({state: {inclusion: 'NotFound'}})}),
		).toBeUndefined();
	});

	it('ignores the same call sent to some other contract', () => {
		// Matching on the function name alone is enough in a small app and stops
		// being enough the moment anything else in it has one. Being wrong here
		// costs the player the ability to buy at all, silently.
		expect(find({'100': operation({to: OTHER})})).toBeUndefined();
	});

	it('ignores the app\u2019s other transactions', () => {
		expect(find({'100': operation({functionName: 'commit'})})).toBeUndefined();
		// A plain transfer carries `unknown` metadata and no function name at all:
		// the top-up flow sends those, to this very account, all the time.
		expect(find({'101': operation({unknownMetadata: true})})).toBeUndefined();
		expect(find({'102': operation({to: null})})).toBeUndefined();
	});

	it('reports the most recent one when a player has bought more than once', () => {
		const found = find({
			'100': operation({state: {inclusion: 'InMemPool'}, hash: '0xold'}),
			'300': operation({state: {inclusion: 'InMemPool'}, hash: '0xnew'}),
			'200': operation({state: {inclusion: 'InMemPool'}, hash: '0xmid'}),
		});
		// Ids are clock timestamps, so this is "latest" rather than "last in
		// whatever order the object happened to enumerate".
		expect(found?.hash).toBe('0xnew');
	});

	it('finds nothing in an empty ledger', () => {
		expect(find({})).toBeUndefined();
	});
});

describe('which of the two states the player is shown', () => {
	const pending = {id: '100', hash: '0xabc' as const, landed: false};

	it('reports one found in the ledger when this tab is doing nothing', () => {
		expect(resolveAcquisitionState({step: 'Idle'}, pending)).toEqual({
			step: 'Pending',
			hash: '0xabc',
			landed: false,
		});
	});

	it('leaves this tab\u2019s own flow alone', () => {
		// The local flow is more specific - it knows whether a signature, a wallet
		// or the signer is being waited on, and it is the only one that can be
		// answered by `choose` or `confirmConsent`. Covering it with the ledger's
		// coarser view would break the dialogs mid-purchase.
		const local: AcquisitionState = {
			step: 'Consent',
			bullets: [],
			payer: SALE,
			total: 1n,
			authorisation: 'live-signature',
		};
		expect(resolveAcquisitionState(local, pending)).toBe(local);
		expect(resolveAcquisitionState({step: 'Acquiring'}, pending)).toEqual({
			step: 'Acquiring',
		});
	});

	it('leaves an error showing, even with the transaction itself in flight', () => {
		// The reachable case: the purchase landed and the signer's registration
		// failed. There is something to act on, and hiding it behind "still
		// buying" would leave the player waiting for a step that already finished.
		const local: AcquisitionState = {
			step: 'Error',
			error: new Error('x'),
			message: 'x',
		};
		expect(resolveAcquisitionState(local, pending)).toBe(local);
	});

	it('is idle when there is nothing anywhere', () => {
		expect(resolveAcquisitionState({step: 'Idle'}, undefined)).toEqual({
			step: 'Idle',
		});
	});
});

describe('the guard that stops a second charge', () => {
	/**
	 * The store itself, built over a ledger and nothing else.
	 *
	 * `buy()` asks whether one is already under way BEFORE it looks at payment
	 * methods or wallets, so a deps object with only account data in it is enough
	 * to exercise the guard - and an acquisition that got past it would announce
	 * itself loudly here by reaching for one of the things that is not there.
	 */
	const acquisition: Acquisition = {
		address: SALE,
		functionName: 'purchase',
		price: 1n,
		stipend: 0n,
		gas: 1n,
		request: () => ({abi: [], args: [], value: 1n}),
	};

	function store(operations: Record<string, OnchainOperation>) {
		const deps = {
			accountData: {watchField: () => writable(operations)},
		} as unknown as AcquisitionDeps;
		return createAcquisition({
			deps,
			acquisition,
			owner: writable(undefined),
			grant: {action: 'play your moves'},
		});
	}

	it('refuses to buy while the ledger says one is already paid for', async () => {
		// THE WHOLE POINT. After a reload this tab is doing nothing, its own state
		// is Idle, and the setup gate would happily offer to sell again - for real
		// money, for a second one, because nothing about the two collides.
		const acquire = store({
			'100': operation({state: {inclusion: 'InMemPool'}}),
		});
		expect(acquire.value.step).toBe('Pending');
		await acquire.buy();
		expect(acquire.value.step).toBe('Pending');
	});

	it('tells anything watching, not just its own guard', () => {
		// The HUD subscribes: it is what turns this into "finishing a purchase you
		// already paid for" on screen and disables the button. A store whose guard
		// knew about the ledger while its subscribers did not would refuse behind
		// a button still reading "buy", which looks like the app is broken rather
		// than careful.
		const acquire = store({
			'100': operation({state: {inclusion: 'InMemPool'}}),
		});
		const seen: AcquisitionState[] = [];
		acquire.subscribe((state) => seen.push(state))();
		expect(seen.at(-1)?.step).toBe('Pending');
	});

	it('still lets a player buy when the ledger holds nothing', async () => {
		// Guards the guard: a refusal that refused everything would pass the test
		// above and lock every new player out of the game.
		const acquire = store({});
		expect(acquire.value.step).toBe('Idle');
		await acquire.buy();
		// It gets as far as needing an owner, which is the next thing `buy` checks.
		expect(acquire.value.step).toBe('Error');
	});
});

describe('catching up once a recovered acquisition finishes', () => {
	it('re-reads when it stops being pending', () => {
		// Nothing else will: this browser did not send the transaction, so none of
		// the code that normally follows one runs.
		const acquisition = writable<AcquisitionState>({
			step: 'Pending',
			landed: false,
		});
		const onSettled = vi.fn();
		refreshWhenPendingAcquisitionSettles({acquisition, onSettled});
		expect(onSettled).not.toHaveBeenCalled();

		acquisition.set({step: 'Idle'});
		expect(onSettled).toHaveBeenCalledTimes(1);
	});

	it('does nothing for a session that never had one', () => {
		// The first reading is this browser learning what was already true. Firing
		// on it would re-read the account on every single load.
		const acquisition = writable<AcquisitionState>({step: 'Idle'});
		const onSettled = vi.fn();
		refreshWhenPendingAcquisitionSettles({acquisition, onSettled});
		acquisition.set({step: 'Idle'});
		expect(onSettled).not.toHaveBeenCalled();
	});

	it('re-reads once per acquisition, not once per emission', () => {
		const acquisition = writable<AcquisitionState>({
			step: 'Pending',
			landed: false,
		});
		const onSettled = vi.fn();
		refreshWhenPendingAcquisitionSettles({acquisition, onSettled});
		acquisition.set({step: 'Idle'});
		acquisition.set({step: 'Idle'});
		expect(onSettled).toHaveBeenCalledTimes(1);
	});

	it('stops watching when it is torn down', () => {
		const acquisition = writable<AcquisitionState>({
			step: 'Pending',
			landed: false,
		});
		const onSettled = vi.fn();
		const stop = refreshWhenPendingAcquisitionSettles({acquisition, onSettled});
		stop();
		acquisition.set({step: 'Idle'});
		expect(onSettled).not.toHaveBeenCalled();
	});
});

describe('which hash a replaced acquisition reports', () => {
	it('reports the attempt that landed, not the one it replaced', () => {
		// They differ exactly when a transaction got stuck and was resubmitted,
		// which is when this hash is most likely to be looked at. Reporting the
		// superseded attempt sends the player to one that never made it.
		expect(find({'100': replacedOperation()})?.hash).toBe('0xreplacement');
	});

	it('still reports the first attempt while nothing has been included', () => {
		expect(
			find({'100': operation({state: {inclusion: 'InMemPool'}})})?.hash,
		).toBe('0xabc');
	});
});

import {describe, it, expect} from 'vitest';
import {setupNeeded} from '$lib/placement/context';
import type {DelegationValue} from '$lib/onchain/delegation';

/**
 * The gate in front of a player's first move.
 *
 * Two opposite failures, both invisible from reading it. Too LOOSE and the
 * board invites a turn that cannot be committed: `makeCommitment` resolves the
 * sender against the account's registered delegates and reverts with
 * `NotDelegate`, so an unauthorised browser lets someone plan a whole
 * submission and then fails as the phase closes, which is when it is too late
 * to fix. Too STRICT and it hides a perfectly playable board behind a demand
 * the player has already met - and since the delegation answer arrives from a
 * chain read, the obvious way to get that wrong is to treat "not read yet" as
 * "not allowed".
 *
 * The answer is a FIELD now, not an address comparison. The read is scoped to
 * the (account, this browser's signer) pair, so it says whether THIS browser
 * may play; an account may authorise several, and no single address the chain
 * could return would have been an answer about this one.
 */

const ACCOUNT = '0x1111111111111111111111111111111111111111' as const;

const authorised: DelegationValue = {
	step: 'Loaded',
	allowed: true,
	withdrawn: false,
};

const staked = {step: 'Loaded', amount: 100n};

describe('what stands between a player and their first move', () => {
	it('asks to sign in before anything else', () => {
		expect(
			setupNeeded({
				identity: undefined,
				delegation: {step: 'Unloaded'} as DelegationValue,
				reserve: {step: 'Unloaded'},
			}),
		).toEqual({step: 'sign-in'});
	});

	it('asks to authorise a browser the account has not authorised', () => {
		// Still reachable, and still needed: a player who ALREADY has a stake but
		// is opening a second browser, or who revoked this one. They have nothing
		// left to buy, so there is no purchase to fold the authorisation into.
		expect(
			setupNeeded({
				identity: ACCOUNT,
				delegation: {step: 'Loaded', allowed: false, withdrawn: false},
				reserve: staked,
			}),
		).toEqual({step: 'authorise'});
	});

	it('does NOT ask while the answer is still being read', () => {
		// The strict-direction mistake, and the one that would ship: every load
		// starts Unloaded, so treating it as "not authorised" puts the gate over
		// the board of an authorised player, every single time, until the read
		// lands. It looks like a flicker and it is a lie.
		expect(
			setupNeeded({
				identity: ACCOUNT,
				delegation: {step: 'Unloaded'} as DelegationValue,
				reserve: staked,
			}),
		).toBeUndefined();
	});

	it('asks for the STAKE first, because acquiring one authorises too', () => {
		// Order is a real decision, not a tie-break, and this one was the other way
		// round until acquiring a stake started carrying the authorisation with it.
		// The reasoning is unchanged - a player who abandons setup half way should
		// have spent as little as possible - and it now points the other way:
		// staking is ONE transaction that also funds the signer, and the signer
		// registers itself out of that stipend, so asking to authorise first would
		// demand a transaction the very next step includes.
		expect(
			setupNeeded({
				identity: ACCOUNT,
				delegation: {step: 'Loaded', allowed: false, withdrawn: false},
				reserve: {step: 'Loaded', amount: 0n},
			}),
		).toEqual({step: 'stake'});
	});

	it('asks for a stake when the browser may already play', () => {
		expect(
			setupNeeded({
				identity: ACCOUNT,
				delegation: authorised,
				reserve: {step: 'Loaded', amount: 0n},
			}),
		).toEqual({step: 'stake'});
	});

	it('does NOT ask for a stake while the reserve is still being read', () => {
		// The same strict-direction mistake as the delegation one above, now that
		// the reserve is the first thing asked about: every load starts Unloaded,
		// and treating that as an empty reserve would put the gate over the board
		// of a staked player on every load until the read lands.
		expect(
			setupNeeded({
				identity: ACCOUNT,
				delegation: authorised,
				reserve: {step: 'Unloaded'},
			}),
		).toBeUndefined();
	});

	it('gets out of the way once both are done', () => {
		expect(
			setupNeeded({
				identity: ACCOUNT,
				delegation: authorised,
				reserve: staked,
			}),
		).toBeUndefined();
	});

	it('asks again once the authorisation is withdrawn', () => {
		// Revoking is offered in the account panel, and it can happen in another
		// tab. The gate is derived from the live read rather than decided once at
		// startup, so the board goes back to asking instead of failing later.
		//
		// Withdrawn is per delegate, so this is THIS browser being withdrawn, not
		// the account giving up on delegation: the remedy is still to authorise,
		// and the route it takes (a transaction from the owner rather than a
		// signature) is decided further in. See ui/delegation/registration.
		expect(
			setupNeeded({
				identity: ACCOUNT,
				delegation: {step: 'Loaded', allowed: false, withdrawn: true},
				reserve: staked,
			}),
		).toEqual({step: 'authorise'});
	});
});

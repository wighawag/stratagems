import {describe, expect, it} from 'vitest';
import {
	acquisitionAuthorisation,
	acquisitionTotal,
	opensAWallet,
	stipendFor,
} from '$lib/game/acquire';
import {availablePaymentMethods, paymentMethods} from '$lib/core/funding';
import {consentBullets} from '$lib/ui/delegation/grant';

/**
 * What the player is shown before their wallet opens.
 *
 * Two shortcuts, both of which put a wallet dialog in front of someone who had
 * not been told what it was. Neither is testable end to end without a wallet,
 * so what is pinned here is the DECISION each one turns on. Both are wrong in
 * the same direction: skipping a step because with one obvious answer the step
 * looks like ceremony.
 */
describe('what the player is shown before their wallet opens', () => {
	it('offers the choice whenever there is more than one method to show', () => {
		// The failure: with an empty account the only USABLE method is the payment
		// rail, so skipping the chooser sends the player straight into a wallet
		// picker, never told that paying from their account was an option or why
		// it was refused. `paymentMethods` fills in `unavailableReason` for
		// exactly that, which is worth nothing if the entry is never rendered.
		const methods = paymentMethods({
			accountSpendable: 0n,
			ownerCanSend: true,
			walletsAvailable: 1,
		});
		expect(methods).toHaveLength(2);
		expect(availablePaymentMethods(methods)).toHaveLength(1);

		const account = methods.find((m) => m.id === 'account');
		expect(account?.available).toBe(false);
		// The reason is the whole point of showing it greyed out rather than not
		// at all.
		expect(account?.unavailableReason).toBeTruthy();
	});

	it('has something to say before asking for a signature', () => {
		// The consent list, from the app's own grant. The failure is not that this
		// list is wrong; it is that nothing shows it, so the first the player
		// hears of authorising this browser is their wallet presenting a message
		// to sign. A signature prompt with no preceding explanation is the one
		// thing a careful user is right to refuse.
		const bullets = consentBullets({action: 'play your moves'});
		expect(bullets.length).toBeGreaterThan(1);
		expect(bullets[0]).toContain('play your moves');
		// It has to say what the key CANNOT do, or "authorise" is the word every
		// drainer uses and nothing distinguishes this from one.
		expect(bullets.join(' ')).toMatch(/cannot move your funds/i);
		expect(bullets.join(' ')).toMatch(/withdraw it later/i);
	});
});

describe('what the one transaction forwards, and to whom', () => {
	const SIGNER = '0x2222222222222222222222222222222222222222' as const;

	it('funds the delegate it is about to register', () => {
		expect(stipendFor({delegate: SIGNER, stipend: 500n})).toEqual({
			stipendTo: SIGNER,
			stipend: 500n,
		});
	});

	it('forwards NOTHING when there is no delegate to fund', () => {
		// Two ordinary ways to get here: a build with no sign-in derives no signer
		// at all, and a browser that is already a delegate has nothing to
		// authorise. Both must send the price alone.
		//
		// The failure is invisible in the cheap direction and expensive in the
		// other: a stipend with nobody to receive it is either kept by the sale, or
		// - where the contract refuses to keep it - reverts every purchase the
		// moment a returning player buys a second time.
		expect(stipendFor({delegate: undefined, stipend: 500n})).toEqual({
			stipendTo: undefined,
			stipend: 0n,
		});
	});

	it('asks the wallet for the price alone when nothing is forwarded', () => {
		// The pairing has to reach the VALUE too, or the split the contract checks
		// and the amount sent disagree.
		const {stipend} = stipendFor({delegate: undefined, stipend: 500n});
		expect(acquisitionTotal({price: 7n, stipend})).toBe(7n);
		expect(acquisitionTotal({price: 7n, stipend: 500n})).toBe(507n);
	});
});

describe('how an acquisition will authorise the browser', () => {
	/**
	 * The question the dialog's words hang on, and the tempting way to answer it
	 * is `signsWithoutPrompt` alone - which recognises the development burner by
	 * name and NOTHING else. An account whose credential was minted at sign-in
	 * then gets told "one signature, then the purchase", and is offered a "Sign
	 * and buy" button for a signature that is never going to be requested.
	 *
	 * The inputs are the shared readers' own answers (`isRegistered`,
	 * `DelegationAccount.canSignLive`, `signsWithoutPrompt`), so this pins the
	 * RULE rather than a second reading of a connection.
	 */
	const preSigned = {
		registered: false,
		hasSigner: true,
		ownerCanSignLive: false,
		silentWallet: false,
	};

	it('asks a pre-authorised account for nothing: its credential exists', () => {
		expect(acquisitionAuthorisation(preSigned)).toBe('pre-signed');
		expect(opensAWallet('pre-signed')).toBe(false);
	});

	it('asks a wallet owner to sign, live', () => {
		expect(
			acquisitionAuthorisation({...preSigned, ownerCanSignLive: true}),
		).toBe('live-signature');
		expect(opensAWallet('live-signature')).toBe(true);
	});

	it('knows the one wallet that signs without showing anything', () => {
		// The development burner holds its key in this browser. It IS signing, so
		// it is not the pre-signed case, and nothing pops up, so it is not the
		// wallet case either.
		expect(
			acquisitionAuthorisation({
				...preSigned,
				ownerCanSignLive: true,
				silentWallet: true,
			}),
		).toBe('silent-signature');
		expect(opensAWallet('silent-signature')).toBe(false);
	});

	it('has nothing to authorise when the signer is already a delegate', () => {
		// A second purchase, on a browser that was authorised for the first. There
		// is no consent to take and no stipend to forward: it is only a purchase.
		expect(
			acquisitionAuthorisation({...preSigned, registered: true}),
		).toBeUndefined();
	});

	it('has nothing to authorise when there is no signer at all', () => {
		// A build with no sign-in derives no signer, so the player plays through
		// their wallet and there is no key to authorise. Asking them to consent to
		// one would describe something that does not exist.
		expect(
			acquisitionAuthorisation({...preSigned, hasSigner: false}),
		).toBeUndefined();
	});
});

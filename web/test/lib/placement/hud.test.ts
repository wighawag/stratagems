import {describe, it, expect} from 'vitest';
import {get, writable, type Writable} from 'svelte/store';
import {
	createHud,
	describePlanLimit,
	describeSubmission,
} from '$lib/placement/ui/hud';
import type {Context} from '$lib/context/types';
import {SignerOutOfFundsError} from '$lib/game/core/commit-reveal/errors';
import type {SubmissionState} from '$lib/game/core/submission';
import type {Placement} from '$lib/placement/commit-reveal';

/**
 * What the player is TOLD, which is the only part of a failure they can act on.
 *
 * These branches were uncovered until the classifier moved upstream, and the
 * gap was invisible: the strings are right there in the source and reading them
 * proves nothing about which one is reached. The distinction being pinned here
 * is between a failure with a remedy (the signer has no gas: top it up and the
 * submission carries on by itself) and one without, because sending a player to
 * buy gas they already have is worse than telling them nothing.
 */

type State = SubmissionState<Placement>;

const idle = (): State => ({step: 'Idle'});

const failed = (during: 'commit' | 'reveal', error: unknown): State => ({
	step: 'Error',
	during,
	cycleNumber: 3,
	actions: [{cellID: 1n}],
	message: (error as Error).message,
	error,
});

describe('what the HUD says about a failed submission', () => {
	it('names the gas problem, not the transaction, when the signer is empty', () => {
		const commit = describeSubmission(
			failed('commit', new SignerOutOfFundsError(new Error('whatever'))),
		);
		expect(commit.label).toBe(
			'Your moves could not be sent: no gas left to play with.',
		);
		expect(commit.tone).toBe('bad');

		const reveal = describeSubmission(
			failed('reveal', new SignerOutOfFundsError(new Error('whatever'))),
		);
		expect(reveal.label).toBe(
			'Your reveal could not be sent: no gas left to play with.',
		);
	});

	it("does not use upstream's wording, which names the wrong account", () => {
		// `INSUFFICIENT_FUNDS_SUMMARY` says "this account does not have enough
		// funds". True, and misleading here: the account is a signer the player
		// was never told about, so they read "this account" as their wallet and go
		// and look at a balance that is fine. The game names whose shortfall it is.
		const {label} = describeSubmission(
			failed('commit', new SignerOutOfFundsError(new Error('whatever'))),
		);
		expect(label).not.toMatch(/this account/i);
		expect(label).toMatch(/gas/i);
	});

	it('reports any other failure as itself, with the message', () => {
		// Including a revert that mentions funds. The remedy on offer must follow
		// what the boundary decided, not what the text happens to say.
		const {label, tone} = describeSubmission(
			failed('commit', new Error('execution reverted: insufficient funds')),
		);
		expect(label).toBe('Commit failed: execution reverted: insufficient funds');
		expect(label).not.toMatch(/no gas left/);
		expect(tone).toBe('bad');
	});

	it('tells the player to retry a failed reveal before the phase ends', () => {
		// The reveal is the one with a stake on it, and the window closes.
		const {label} = describeSubmission(
			failed('reveal', new Error('nonce too low')),
		);
		expect(label).toBe(
			'Reveal failed: nonce too low. Retry before the phase ends.',
		);
	});

	it('says what a missed reveal cost, rather than that something went wrong', () => {
		const {label, tone} = describeSubmission({
			step: 'Missed',
			cycleNumber: 7,
			actions: [{cellID: 1n}],
		} as unknown as State);
		expect(label).toBe('Missed the reveal for cycle 7. The bond is forfeit.');
		expect(tone).toBe('bad');
	});

	it('counts the pieces of a turn bigger than a transaction', () => {
		// A long turn is opened one transaction at a time, so the player watches
		// their cells arrive in batches over a noticeable stretch of the reveal
		// phase. Without the count that reads as a board filling in at random.
		expect(
			describeSubmission({
				step: 'Revealing',
				cycleNumber: 7,
				actions: [{cellID: 1n}],
				progress: {done: 1, total: 3},
			}).label,
		).toBe('Revealing... (1 of 3)');
	});

	it('does not dress an ordinary one-transaction reveal up as a procedure', () => {
		for (const progress of [undefined, {done: 0, total: 1}]) {
			expect(
				describeSubmission({
					step: 'Revealing',
					cycleNumber: 7,
					actions: [{cellID: 1n}],
					progress,
				}).label,
			).toBe('Revealing...');
		}
	});
});

/** A context with only the parts `createHud` reads. */
function fakeContext(submission: State, hasLocalSigner = true) {
	return {
		hasLocalSigner,
		// The setup gate's button carries the price, so the HUD reads the chain's
		// own currency to write it. `get()` rather than a store: it is a fact about
		// the deployment, not something that changes while the app runs.
		deployments: {
			get: () => ({chain: {nativeCurrency: {symbol: 'ETH', decimals: 18}}}),
		},
		game: {
			config: {sale: {price: 1n, amount: 10n, stipend: 2n}},
			twoPhase: writable({phase: 'play', timeLeft: 10, duration: 20}),
			// The four-part model, asked separately from the countdown: the
			// catch-up has no countdown at all. See game/core/cycle-phase.ts.
			phase: writable('play'),
			submission: writable(submission),
			// `maxActions` is how many placements this client could still OPEN in one
			// reveal phase, and `undefined` bounds nothing: it is what the chain
			// clock answers before it has measured a block time.
			planning: {count: writable(1), maxActions: writable(undefined)},
			cost: writable(0n),
			reserve: writable({step: 'Loaded', amount: 100n}),
			cycleInfo: writable({currentCycleNumber: 3}),
			missedReveal: writable({step: 'Clear'}),
			setup: writable(undefined),
			acquisition: writable({step: 'Idle'}),
			recovery: writable({step: 'Idle'}),
		},
	} as unknown as Context;
}

describe('the remedy the HUD offers', () => {
	it('offers the top-up when the signer ran out of gas', () => {
		const model = get(
			createHud(
				fakeContext(
					failed('reveal', new SignerOutOfFundsError(new Error('empty'))),
				),
			),
		);

		expect(model.outOfGas).toBeDefined();
		expect(model.outOfGas?.detail).toMatch(/top it up/i);
	});

	it('offers NOTHING for a failure a top-up cannot fix', () => {
		// The offer is a button that spends money and then retries. Showing it for
		// a revert tells the player their stake is recoverable by paying, and it is
		// not: the move fails again identically. Silence is the honest answer.
		const model = get(
			createHud(
				fakeContext(
					failed(
						'reveal',
						new Error('execution reverted: insufficient funds for transfer'),
					),
				),
			),
		);

		expect(model.outOfGas).toBeUndefined();
	});
});

describe('what the HUD says when there is no local signer', () => {
	/**
	 * `hasLocalSigner` is `TARGET_STEP === 'SignedIn'`, and NOTHING ELSE.
	 *
	 * This notice used to read "No hosted sign-in is configured... Set
	 * PUBLIC_WALLET_HOST to play with a local signing key instead", which was
	 * wrong twice: hosted sign-in is a different axis entirely, and setting a
	 * wallet host does not produce a signer. A signer is derived from a wallet
	 * signature with no service involved, so signing in with no host at all is a
	 * complete configuration - core/connection/mode.ts says exactly that, and
	 * says of this very predicate "Deliberately NOT 'is PUBLIC_WALLET_HOST set'".
	 *
	 * Anyone who followed the old advice would have configured a wallet host and
	 * still had no signer. Pinned because it is a STRING: nothing else would
	 * catch it going wrong again.
	 */
	it('names the knob that actually controls it', () => {
		const model = get(
			createHud(fakeContext({step: 'Idle'} as unknown as State, false)),
		);
		expect(model.walletSigningNotice).toBeDefined();
		expect(model.walletSigningNotice).toContain('TARGET_STEP');
		expect(model.walletSigningNotice).toMatch(/does not sign in/i);
	});

	it('never blames hosted sign-in, which is a different axis', () => {
		const model = get(
			createHud(fakeContext({step: 'Idle'} as unknown as State, false)),
		);
		expect(model.walletSigningNotice).not.toMatch(/PUBLIC_WALLET_HOST/);
		expect(model.walletSigningNotice).not.toMatch(/hosted/i);
	});

	it('says nothing at all when the app does sign in', () => {
		const model = get(
			createHud(fakeContext({step: 'Idle'} as unknown as State)),
		);
		expect(model.walletSigningNotice).toBeUndefined();
	});
});

/**
 * The most time-critical thing this HUD ever says.
 *
 * A commitment the chain holds and this browser cannot open is recoverable for
 * exactly one cycle, so the sentence has to carry three things: that a
 * commitment exists, that it can still be opened, and that only the same turn
 * will open it. It must NOT say the stake is lost - it is not, yet, which is
 * the entire reason for showing anything.
 */
describe('a submission the chain holds and this browser has lost', () => {
	it('says nothing at all when there is nothing to recover', () => {
		const model = get(createHud(fakeContext(idle())));
		expect(model.recovery).toBeUndefined();
	});

	it('says it can still be revealed, and asks for the same turn back', () => {
		const context = fakeContext(idle());
		(context.game as unknown as {recovery: Writable<unknown>}).recovery.set({
			step: 'Found',
			cycleNumber: 3,
		});
		const model = get(createHud(context));

		expect(model.recovery?.headline).toContain('cycle 3');
		expect(model.recovery?.detail).toMatch(/can still be revealed/i);
		// The one thing it must never say while the stake is still savable.
		expect(model.recovery?.detail).not.toMatch(/forfeit|lost/i);
	});

	it('will not offer to recover an empty board', () => {
		// Offering nothing would spend a signature to be told no, and read to the
		// player as the app refusing a turn they had not entered yet.
		const context = fakeContext(idle());
		(context.game as unknown as {recovery: Writable<unknown>}).recovery.set({
			step: 'Found',
			cycleNumber: 3,
		});
		(
			context.game as unknown as {planning: {count: Writable<number>}}
		).planning.count.set(0);

		expect(get(createHud(context)).recovery?.canRecover).toBe(false);
	});

	it('tells a REFUSED plan apart from a check that could not be made', () => {
		// The two look identical from the button and mean opposite things: one
		// says "that is not your turn", the other says "we could not ask". Read
		// the wrong way round, a player spends the only cycle they have looking
		// for a mistake they did not make.
		const context = fakeContext(idle());
		const recovery = (context.game as unknown as {recovery: Writable<unknown>})
			.recovery;

		recovery.set({step: 'Refused', cycleNumber: 3});
		expect(get(createHud(context)).recovery?.detail).toMatch(
			/not the placements that were committed/i,
		);

		recovery.set({step: 'Failed', cycleNumber: 3, message: 'no signer'});
		const failed = get(createHud(context)).recovery?.detail ?? '';
		expect(failed).toContain('no signer');
		expect(failed).not.toMatch(/not the placements/i);
	});
});

describe('what the HUD says about a turn too long to open', () => {
	/**
	 * THE WARNING WITH THE MONEY IN IT. A plan that costs more than the reserve
	 * is refused by the contract, so it costs a failed commit. A plan longer
	 * than the reveal phase can open is refused by nothing: it commits happily,
	 * cannot finish revealing, and the missed reveal forfeits the stake.
	 */
	it('says nothing until the plan reaches the limit', () => {
		expect(describePlanLimit(5, 36)).toBeUndefined();
		expect(describePlanLimit(35, 36)).toBeUndefined();
	});

	it('names the number, and says what going over would cost', () => {
		const message = describePlanLimit(36, 36) ?? '';
		expect(message).toContain('36');
		// The consequence, not just the refusal: a player who is told only "no"
		// has no way to know this is the one limit that costs them money.
		expect(message).toMatch(/forfeit/i);
	});

	it('does not present it as a rule of the game', () => {
		// It is a limit of this client and this chain - how many transactions fit
		// in the window - not something the game forbids. A player who reads it
		// as a rule goes looking for a rule that does not exist.
		const message = describePlanLimit(36, 36) ?? '';
		expect(message).toMatch(/revealed in one cycle|phase ends/i);
		expect(message).not.toMatch(/not allowed|forbidden|maximum turn/i);
	});

	it('says nothing at all while the limit is unknown', () => {
		expect(describePlanLimit(100, undefined)).toBeUndefined();
	});

	it('is the warning that wins when the plan is also unaffordable', () => {
		const context = fakeContext(idle());
		const game = context.game as unknown as {
			planning: {
				count: Writable<number>;
				maxActions: Writable<number | undefined>;
			};
			cost: Writable<bigint>;
		};
		game.planning.maxActions.set(4);
		game.planning.count.set(4);
		game.cost.set(1_000n); // reserve is 100n in the fixture

		// Both are true. The one that is reported is the one that would cost the
		// stake rather than a reverted transaction.
		expect(get(createHud(context)).warning).toMatch(/forfeit/i);
	});
});

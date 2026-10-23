/**
 * Everything the HUD renders, as one derived store.
 *
 * The components that show this are deliberately logic-less: they take a
 * finished model and lay it out. All the deciding - which phase label to show,
 * whether committing is still possible, what the submission costs - happens
 * here, in plain TypeScript that can be read and tested without a browser.
 */
import {derived, type Readable} from 'svelte/store';
import {formatBalance} from '$lib/core/utils/format/balance';
import {STAKE} from '../stake';
import type {Context} from '$lib/context/types';
import type {SubmissionState} from '$lib/game/core/submission';

import {
	acquisitionTotal,
	opensAWallet,
	type AcquisitionState,
} from '$lib/game/acquire';
import type {Placement} from '../commit-reveal';
import type {ReserveState} from '../reserve';
import {blocksCommitting, type MissedRevealState} from '../missed-reveal';
import type {RecoveryState} from '$lib/game/core/recovery';
import {SignerOutOfFundsError} from '../errors';
import type {SetupNeeded} from '$lib/placement/context';
import type {CyclePhase} from '$lib/game/core/cycle-phase';

export type HudModel = {
	phaseLabel: string;
	/**
	 * Four parts, not two, and the fourth is the reason.
	 *
	 * This used to collapse to play / wait, on the grounds that the only decision
	 * a player has is whether the submission is still theirs to change. That is
	 * true and it left nowhere to put the CATCH-UP: the moment after the cycle
	 * turns over when the board is still showing the last one, which the clock
	 * cannot see. Reported as "wait" it tells the player the cycle is resolving
	 * when nothing is being waited for except a poll, and it is the one state
	 * where a plan would be built from a position that has already changed. See
	 * `game/core/cycle-phase.ts`.
	 */
	phase: CyclePhase;
	/** Seconds left in the phase, already rounded for display. */
	secondsLeft: number;
	/** How far through the phase, 0..1, for a progress bar. */
	progress: number;
	cycleNumber: number;
	/**
	 * Clicking now plans for the NEXT cycle, because this one has closed. Worth
	 * saying: the moves still appear on the board, and without this the player
	 * would reasonably think they were part of the cycle being resolved.
	 */
	planningForNextCycle: boolean;
	/**
	 * Set when this build has NO LOCAL SIGNER, so every move has to be signed in
	 * the wallet. Said once, up front, rather than discovered one prompt at a
	 * time.
	 *
	 * Nothing to do with hosted sign-in, which is a separate axis entirely: see
	 * core/connection/mode.ts, where TARGET_STEP decides whether a signer exists
	 * and PUBLIC_WALLET_HOST decides only whether email and social are offered.
	 */
	walletSigningNotice?: string;
	/**
	 * Set while the player cannot take a turn yet. The HUD shows THIS instead of
	 * the planning controls: offering "plan your moves" to someone with nothing
	 * staked invites them to lay out a whole turn that cannot be committed, and
	 * the failure only arrives when the cycle is already closing.
	 */
	setup?: {
		headline: string;
		detail: string;
		action?: 'stake' | 'authorise';
		/** The words on the button, which for a purchase carry the price. */
		actionLabel?: string;
		/** The purchase is in flight, so the button says so and does nothing. */
		busy?: boolean;
		busyLabel?: string;
		error?: string;
	};

	/**
	 * Set while a stake is being acquired, for the top-up button on a board the
	 * player can already play.
	 *
	 * The same sentence the setup gate uses, and deliberately not folded into it:
	 * that one is shown INSTEAD of the board, this one beside it, and a player
	 * with a reserve that is merely running low is not blocked on it.
	 */
	acquiring?: string;

	plannedCount: number;
	costLabel: string;
	reserveLabel: string;
	/**
	 * Set when the plan cannot be submitted as it stands.
	 *
	 * TWO DIFFERENT WAYS TO BE UNSUBMITTABLE, and they are not the same hazard.
	 * Costing more than the reserve is refused by the CONTRACT, so it costs a
	 * failed commit. Being longer than the reveal window can open is refused by
	 * nothing: it commits happily and then cannot be revealed in time, which
	 * forfeits the stake. The second is the one with the player's money in it, so
	 * it is the one reported when both are true.
	 */
	warning?: string;

	submissionLabel: string;
	submissionTone: 'idle' | 'busy' | 'good' | 'bad';
	canCommit: boolean;
	canReveal: boolean;
	canClear: boolean;
	/**
	 * Set when the move failed because the key that signs moves has no gas.
	 * The one failure the player can fix, so it is named and given a button
	 * rather than left as a transaction error.
	 */
	outOfGas?: {detail: string};

	/**
	 * Set when an unrevealed commitment is blocking play. Holds what was lost and
	 * what the player has to do about it: acknowledging forfeits the bond, so it
	 * is offered rather than done for them.
	 */
	missedReveal?: {
		headline: string;
		detail: string;
		busy: boolean;
		canAcknowledge: boolean;
	};

	/**
	 * Set when the chain holds a commitment for the cycle in progress that this
	 * browser has no memory of. The stake is still recoverable, and only for as
	 * long as the cycle lasts, so this is the most time-critical thing the HUD
	 * ever has to say.
	 */
	recovery?: {
		headline: string;
		detail: string;
		busy: boolean;
		/** Whether there is a plan on the board to offer. */
		canRecover: boolean;
	};
};

export function describeSubmission(state: SubmissionState<Placement>): {
	label: string;
	tone: HudModel['submissionTone'];
} {
	switch (state.step) {
		case 'Idle':
			return {label: 'Nothing planned', tone: 'idle'};
		case 'Planning':
			return {label: 'Planned, not yet committed', tone: 'idle'};
		case 'Committing':
			return {label: 'Sending commitment...', tone: 'busy'};
		case 'Committed':
			return {label: 'Committed. Reveal is owed this cycle.', tone: 'busy'};
		case 'Revealing':
			// A TURN MAY BE BIGGER THAN A TRANSACTION, so a reveal may be several
			// of them, and the player watches their cells arrive a few at a time
			// over a noticeable stretch of the reveal phase. Without the count that
			// reads as a board filling in at random; with it, it reads as progress.
			// Said only when there IS more than one, so an ordinary one-transaction
			// turn is not dressed up as a procedure.
			return {
				label:
					state.progress && state.progress.total > 1
						? `Revealing... (${state.progress.done} of ${state.progress.total})`
						: 'Revealing...',
				tone: 'busy',
			};
		case 'Revealed':
			return {
				label: 'Revealed. Your placements are on the board.',
				tone: 'good',
			};
		case 'Missed':
			return {
				// The one message that costs the player money, so it says what
				// happened rather than just that something went wrong.
				label: `Missed the reveal for cycle ${state.cycleNumber}. The bond is forfeit.`,
				tone: 'bad',
			};
		case 'Error':
			// The type, not upstream's classifier: by the time an error reaches the
			// submission it has been through `send()` in ../commit-reveal, which is
			// where the node's wording is read. Asking again here would re-derive an
			// answer the app already committed to, and could disagree with it.
			if (state.error instanceof SignerOutOfFundsError) {
				return {
					// NOT `INSUFFICIENT_FUNDS_SUMMARY`, though the barrel now exports it
					// and it says the same thing about the same failure. Upstream's
					// sentence is "this account does not have enough funds", which is
					// exactly right for a transaction the player initiated from their
					// wallet and wrong here: the account is a signer they were never
					// told about, so "this account" reads as their wallet, which is
					// probably funded. They would go looking at a balance that is fine.
					// The remedy is to top up the SIGNER, so the message has to point at
					// it ("gas left to play with", spelled out in `outOfGas` below).
					// Upstream names the failure; the game names whose it is.
					label:
						state.during === 'commit'
							? 'Your moves could not be sent: no gas left to play with.'
							: 'Your reveal could not be sent: no gas left to play with.',
					tone: 'bad',
				};
			}
			return {
				label:
					state.during === 'commit'
						? `Commit failed: ${state.message}`
						: `Reveal failed: ${state.message}. Retry before the phase ends.`,
				tone: 'bad',
			};
	}
}

/**
 * What to tell a player whose turn is as long as this client can open.
 *
 * NOT A RULE OF THE GAME, and the wording has to say so: nothing forbids a
 * longer turn, it is this browser that cannot get all of its chunks into the
 * reveal phase before it shuts. Said as a limit of the window rather than as a
 * refusal, because a player who reads it as a rule will go looking for the rule.
 *
 * It is the warning with money in it. A turn too long to open commits happily
 * and then misses its reveal, which forfeits whatever the game puts at stake -
 * here the bond, on the identity branches the avatar itself.
 */
export function describePlanLimit(
	planned: number,
	maxActions: number | undefined,
): string | undefined {
	if (maxActions === undefined || planned < maxActions) return undefined;
	return `That is as much as can be revealed in one cycle here (${maxActions}). A longer turn would not finish revealing before the phase ends, which forfeits your stake.`;
}

/**
 * What to tell the player about a commitment they never revealed.
 *
 * Phrased as a statement of what happened and what it cost, not as an error:
 * the stake is already gone by the time this is shown, and the only remaining
 * choice is whether to settle it on chain and carry on playing.
 */
export function describeMissedReveal(
	state: MissedRevealState,
): HudModel['missedReveal'] {
	if (state.step === 'Clear' || state.step === 'Unknown') return undefined;

	const headline = `You missed the reveal for cycle ${state.cycleNumber}.`;

	if (state.step === 'Acknowledging') {
		return {
			headline,
			detail: 'Acknowledging...',
			busy: true,
			canAcknowledge: false,
		};
	}
	if (state.step === 'Failed') {
		return {
			headline,
			detail: `Could not acknowledge it: ${state.message}`,
			busy: false,
			canAcknowledge: true,
		};
	}
	return {
		headline,
		detail: STAKE.forfeited(state.bond),
		busy: false,
		canAcknowledge: true,
	};
}

/**
 * What acquiring the stake is doing right now, in the player's terms.
 *
 * Four waits that feel different: one the player must answer, one they have
 * paid for, one sent on their behalf without a prompt, and one this browser is
 * not running at all.
 *
 * The WORDS are the game's, which is why this is here rather than in the rail:
 * the rail exports the state, and "your stake" is one game's name for what
 * another calls an avatar or a pass. Parameterising the nouns would produce a
 * sentence that fits nobody well.
 */
export function acquisitionBusyLabel(
	state: AcquisitionState,
): string | undefined {
	switch (state.step) {
		case 'Authorising':
			// ONLY THE ROUTE THAT ACTUALLY OPENS A WALLET is told to look at one. An
			// account whose credential was minted at sign-in gets here too, and its
			// credential is simply handed back without a prompt, so sending it to a
			// window that never opens is worse than saying nothing.
			return opensAWallet(state.authorisation)
				? 'Confirm in your wallet to authorise this browser...'
				: 'Authorising this browser...';
		case 'Acquiring':
			return 'Staking...';
		case 'ChoosingPayer':
			return 'Choose how to pay...';
		case 'Consent':
			return 'Confirm to continue...';
		case 'Registering':
			// No prompt for this one: the signer sends it itself, out of the stipend
			// the purchase just gave it. Unexplained it looks like a hang after the
			// money has already gone.
			return 'Setting up your play key...';
		case 'Pending':
			// A FOURTH kind of wait, and the one that needs saying most: this browser
			// is not doing anything, and the player has no memory of starting it in
			// this tab, because they reloaded. What they must not be told is "stake
			// to play", which is what they would be told without this - and they
			// would, for a second time, with their own money.
			return state.landed
				? 'Your stake is in. Getting it onto the board...'
				: 'Finishing a purchase you already paid for...';
		default:
			return undefined;
	}
}

/**
 * What the dial says beside itself.
 *
 * The catch-up gets its own words rather than being folded into "resolving":
 * nothing is resolving, the board is simply behind, and telling a player the
 * cycle is still running is what makes a stale board look like a stuck one.
 */
export function phaseLabelOf(phase: CyclePhase): string {
	switch (phase) {
		case 'play':
			return 'Plan your moves';
		case 'commit':
			return 'Committing';
		case 'reveal':
			return 'Revealing';
		case 'catching-up':
			return 'Catching up';
	}
}

/** What the player has to do before they can take a turn. */
export function describeSetup(
	setup: SetupNeeded | undefined,
	options?: {priceLabel?: string; busyLabel?: string},
): HudModel['setup'] {
	if (!setup) return undefined;
	switch (setup.step) {
		case 'sign-in':
			return {
				headline: 'Sign in to play',
				detail:
					'Signing in gives the game a key of its own, so your moves are sent without a wallet prompt every turn.',
			};
		case 'authorise':
			return {
				headline: 'Let this browser play for you',
				// Says what it does AND what it does not do, because "authorise" is
				// the word every drainer uses. What is being granted is narrow and
				// the contract enforces it: the key can commit and reveal, and it
				// cannot withdraw the reserve, which only this account can do.
				detail:
					'Your moves are signed here by a key this browser made, so no turn needs a wallet prompt. Authorising lets it play as you and pays it some gas. It can never take your stake out, and you can withdraw the permission at any time.',
				action: 'authorise',
			};
		case 'stake':
			// The WORDS are in `../stake.ts`, with what is at stake, because a game
			// that gates differently rewrites every one of them and nothing else in
			// this file. See the note there.
			return {
				headline: STAKE.setup.headline,
				detail: STAKE.setup.detail,
				action: 'stake',
				actionLabel: STAKE.setup.action(options?.priceLabel),
				busyLabel: options?.busyLabel,
			};
	}
}

/**
 * What to tell a player whose browser has lost a submission the chain still
 * holds.
 *
 * Says the three things that decide what they do next, in the order they need
 * them: that a commitment exists, that it can still be opened, and that only
 * re-entering the same turn will open it. It deliberately does NOT say "your
 * stake is lost" - it is not, yet, and that is the entire point of showing
 * this at all.
 *
 * A REFUSAL IS NOT AN ERROR, and is worded as a fact about the plan rather
 * than as a failure. The player cannot break anything by guessing: the hash
 * refuses a turn that was not committed, which is also why offering this route
 * gives an attacker nothing.
 */
export function describeRecovery(
	state: RecoveryState,
	plannedCount: number,
): HudModel['recovery'] {
	if (state.step === 'Idle') return undefined;

	// NOT "has lost the turn", which is what this said while the copy still
	// called a submission a round. In a game "lose a turn" is an idiom for
	// forfeiting your go, so the shorter wording announced exactly the thing the
	// note above says this must not announce. MISLAID, not forfeited.
	const headline = `This browser no longer has the turn you committed for cycle ${state.cycleNumber}.`;
	if (state.step === 'Checking') {
		return {headline, detail: 'Checking...', busy: true, canRecover: false};
	}

	const detail =
		state.step === 'Refused'
			? 'Those are not the placements that were committed. Try again: nothing is spent, and the turn can still be revealed until this cycle ends.'
			: state.step === 'Failed'
				? // NOT phrased as a wrong plan. The app could not ask, which is a
					// different thing, and the remedy is to press again rather than to
					// go looking for a misremembered turn.
					`The turn could not be checked: ${state.message}. Nothing is lost yet - try again.`
				: 'The commitment is still on chain and can still be revealed, but only this cycle. Click the same cells you planned and recover the turn.';

	return {headline, detail, busy: false, canRecover: plannedCount > 0};
}

export function createHud(context: Context): Readable<HudModel> {
	const {game} = context;

	return derived(
		[
			game.twoPhase,
			game.phase,
			game.submission,
			game.planning.count,
			game.planning.maxActions,
			game.cost,
			game.reserve,
			game.cycleInfo,
			game.missedReveal,
			game.setup,
			game.acquisition,
			game.recovery,
		],
		([
			$twoPhase,
			$phase,
			$submission,
			$count,
			$maxActions,
			$cost,
			$reserve,
			$cycle,
			$missedReveal,
			$setup,
			$acquisition,
			$recovery,
		]): HudModel => {
			const submission = describeSubmission($submission);
			const reserve = $reserve as ReserveState;
			const reserveAmount =
				reserve.step === 'Loaded' ? reserve.amount : undefined;
			const blocked = blocksCommitting($missedReveal as MissedRevealState);

			// `twoPhase` on a manually advanced chain has no clock, only a phase, so
			// the countdown comes from it while the LABEL comes from the four-part
			// model. They are asked separately because the catch-up has no
			// countdown at all: it lasts until a fetch lands, however long that is.
			const timeLeft = 'timeLeft' in $twoPhase ? $twoPhase.timeLeft : 0;
			const duration = 'duration' in $twoPhase ? $twoPhase.duration : 0;
			const phase = $phase as CyclePhase;
			const playable = phase === 'play';

			const acquisition = $acquisition as AcquisitionState;
			const needsSetup = describeSetup($setup as SetupNeeded | undefined, {
				busyLabel: acquisitionBusyLabel(acquisition),
				// THE TOTAL, not the price. The wallet is about to ask for
				// `price + stipend`, and the two can differ by orders of magnitude: a
				// button that understates what is about to be charged is worse than
				// one with no number on it.
				priceLabel: `${formatBalance(
					acquisitionTotal(game.config.sale),
				)} ${context.deployments.get().chain.nativeCurrency.symbol}`,
			});
			if (needsSetup?.action === 'stake') {
				needsSetup.busy = needsSetup.busyLabel !== undefined;
				needsSetup.error =
					acquisition.step === 'Error' ? acquisition.message : undefined;
			}

			return {
				// Never invite a move the player cannot make: while they are still
				// being set up the clock is just a clock.
				phaseLabel: needsSetup ? 'Cycle in progress' : phaseLabelOf(phase),
				phase,
				secondsLeft: Math.max(0, Math.ceil(timeLeft)),
				progress:
					duration > 0 ? Math.min(1, Math.max(0, 1 - timeLeft / duration)) : 0,
				cycleNumber: $cycle.currentCycleNumber,
				// Outside the play window the current cycle is closed, so a click now
				// is a plan for the next one. The submission stamps it that way. Not worth
				// saying to someone who cannot play at all yet.
				planningForNextCycle: !playable && !needsSetup,
				setup: needsSetup,
				acquiring: acquisitionBusyLabel(acquisition),
				// `hasLocalSigner` is `TARGET_STEP === 'SignedIn'`, and NOTHING ELSE.
				// It is not about hosted sign-in, and core says so where it is
				// defined: "Deliberately NOT 'is PUBLIC_WALLET_HOST set': a
				// wallet-only sign-in has no host and still derives a signer, so
				// testing the host would get it wrong."
				//
				// This notice used to say the opposite - that no hosted sign-in was
				// configured, and that setting PUBLIC_WALLET_HOST would give the
				// player a local signing key. Both halves were wrong, and together
				// they sent anyone who read it to configure a wallet host and still
				// have no signer: a signer is derived from a wallet signature with no
				// service involved, so `SignedIn` + wallet-only is complete and
				// backend-free. The knob is TARGET_STEP, which is code, not env.
				walletSigningNotice: context.hasLocalSigner
					? undefined
					: "This build does not sign in, so there is no local signing key and every commit and reveal needs a wallet signature. Set TARGET_STEP to 'SignedIn' in core/connection/mode.ts to play with one.",

				plannedCount: $count,
				costLabel: STAKE.amount($cost),
				reserveLabel:
					reserveAmount === undefined ? '-' : STAKE.amount(reserveAmount),
				warning:
					describePlanLimit($count, $maxActions as number | undefined) ??
					(reserveAmount !== undefined && $cost > reserveAmount
						? STAKE.notEnough
						: undefined),

				submissionLabel: submission.label,
				submissionTone: submission.tone,
				missedReveal: describeMissedReveal($missedReveal as MissedRevealState),
				recovery: describeRecovery($recovery as RecoveryState, $count),
				// Committing early is allowed the whole time the phase is open; the
				// submission commits by itself if the player leaves it too late. An
				// unrevealed commitment blocks it entirely: the contract would reject
				// it, so offering the button would only spend gas to be told no.
				// A failed commit can be tried again while the phase is open: the
				// plan is still here and nothing was spent.
				canCommit:
					!blocked &&
					($submission.step === 'Planning' ||
						($submission.step === 'Error' &&
							$submission.during === 'commit')) &&
					$count > 0 &&
					playable,
				// Offered as a fallback only. The submission reveals on its own, because a
				// missed reveal forfeits the bond and the window can be seconds long.
				canReveal:
					$submission.step === 'Error' && $submission.during === 'reveal',
				canClear: $submission.step === 'Planning' && $count > 0,
				outOfGas:
					$submission.step === 'Error' &&
					$submission.error instanceof SignerOutOfFundsError
						? {
								detail:
									'Moves are signed by a key held for you, and it has run out of gas. Top it up and this turn carries on by itself.',
							}
						: undefined,
			};
		},
	);
}

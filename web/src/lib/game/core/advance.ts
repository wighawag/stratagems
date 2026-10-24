/**
 * PUSHING THE CYCLE ON, which under two of the three policies is something a
 * TRANSACTION has to do and which nothing in this tree did until now.
 *
 * This is framework, not a seam, and the reason it is framework is the whole
 * point of the file: `grep -rn advanceCycle web/src` used to find the ABI and
 * no caller, so a MANUAL deployment could not complete a round - on a chain in
 * the tab, on a local node, or on an ordinary remote chain. The round is
 * commit, advance, reveal, advance, and a reveal sent before the advance is
 * refused with `InCommitmentPhase`. The embedded world is only where that gap
 * was first walked into.
 *
 * ADVANCING IS ITS OWN TRANSACTION AND NEVER A RIDER ON THE LAST REVEAL (C5 in
 * the plan on the `work` branch, and the same three reasons are written at
 * `UsingGameInternal._advanceCycle`). It is PERMISSIONLESS AND STRICTLY
 * CONDITIONAL: anyone may call it, and it may only ever do what the rules
 * already permit, so it is nobody's move. That is why this file sends it from
 * the same key that sends the player's moves and never asks them about it - it
 * spends gas on the player's behalf to keep the cycle turning, and it can never
 * spend the STAKE. (The rule it is on the right side of:
 * `acknowledgeMissedReveal` forfeits a bond and is therefore the player's to
 * press; an advance takes nothing from anyone.)
 *
 * THE CONDITIONS ARE MIRRORED HERE, AND WHETHER THAT IS SAFE DEPENDS ON A
 * PROPERTY OF YOUR CONTRACT THAT THIS FILE CANNOT CHECK.
 * {@link advancePermitted} is a copy of the contract's own guards, and copies
 * drift. The copy is admissible when the contract RE-CHECKS the same conditions
 * at execution time and reverts, because then this is only an optimisation:
 * being wrong in the strict direction costs one reverted transaction, being
 * wrong in the lax direction costs nothing at all, and no stake is ever on the
 * prediction. That is the argument this file used to make in capitals, flatly,
 * as though it were a statement about the framework.
 *
 * IT IS A STATEMENT ABOUT ONE CONTRACT. The reference game's `_advanceCycle`
 * re-checks the policy, that somebody is waited for, that everyone waited for
 * has committed, and that every commitment in the cycle has been opened. A game
 * in this tree already does NOT: its own advance checks the policy and nothing
 * else, with the unanimity guard left as a TODO. There the mirrored guard is not
 * a prediction, it is the ONLY guard - and being wrong in the lax direction
 * opens the reveal phase on a player who never committed, or closes a cycle on
 * one who never revealed. In a game whose stake is an avatar, that is the avatar.
 *
 * SO THE RELIANCE IS DECLARED RATHER THAN ASSUMED: {@link CycleAdvanceDeps}
 * takes `contractIsTheJudge`, with no default, so adopting this file means
 * answering the question rather than inheriting the reassurance. Answer `false`
 * and two things change, both of them about not spending somebody's stake on a
 * guess this client alone is making: {@link CycleAdvanceStore.advance} stops
 * being an unconditional push, and the cycle is re-read immediately before any
 * push, because a phase reading that is one poll out of date is the one way a
 * permitted-looking advance is the wrong one.
 *
 * WHAT IT DOES NOT DO IS MAKE AN UNGUARDED CONTRACT SAFE. Nothing a client does
 * can, because anyone may call an advance and most callers are not this file.
 * `false` buys care in this browser; the fix is in the contract.
 */
import {writable, type Readable} from 'svelte/store';
import type {CycleInfoStore, CyclePolicy} from './cycle';

/**
 * WHO THE CYCLE IS WAITING FOR, and how many of them have acted.
 *
 * The client's half of the contract's `Attendance`. `waitedFor` is the
 * denominator unanimity is measured against and is deliberately NOT "how many
 * players exist": a game may keep a silent player in the world while no longer
 * blocking on them.
 */
export type Attendance = {
	waitedFor: number;
	/** How many waited-for members have committed IN THE CURRENT CYCLE. */
	committed: number;
	/** How many of those commitments have been opened. */
	revealed: number;
};

/** Why an advance would be refused, in the contract's own terms. */
export type AdvanceRefusal =
	/** `Timed`: the cycle simply IS what the clock says. `NextPhaseNotAllowed`. */
	| 'the-clock-decides'
	/** No closed set, so no denominator. `NoOneToWaitFor`. */
	| 'nobody-is-waited-for'
	/** `StillWaitingToCommit`. */
	| 'still-waiting-to-commit'
	/** `StillWaitingToReveal`. */
	| 'still-waiting-to-reveal';

export type AdvanceVerdict =
	| {permitted: true; opens: 'the-reveal-phase' | 'the-next-cycle'}
	| {permitted: false; because: AdvanceRefusal};

/**
 * Would the contract accept an advance right now?
 *
 * A PREDICTION WHERE THE CONTRACT JUDGES, AND THE ONLY GUARD WHERE IT DOES NOT
 * - see the file comment, which is the one place that difference is spelled
 * out. It answers in the same order the reference contract checks, so a
 * disagreement is one line to find rather than a whole path to re-derive.
 *
 * UNANIMITY, NEVER A MAJORITY: `committed < waitedFor` refuses. A subset that
 * could close a phase would time slow players out and turn the cycle into a
 * race, which is the order-independence failure one level up - whoever is
 * quickest would decide the outcome and committing would have bought nothing.
 */
export function advancePermitted(params: {
	policy: CyclePolicy;
	isCommitPhase: boolean;
	attendance: Attendance;
}): AdvanceVerdict {
	const {policy, isCommitPhase, attendance} = params;

	if (policy === 'timed') {
		return {permitted: false, because: 'the-clock-decides'};
	}
	if (attendance.waitedFor === 0) {
		// Without this one caller could push an empty game forward as fast as
		// they liked, which is the contract's reason and is equally this one's.
		return {permitted: false, because: 'nobody-is-waited-for'};
	}
	if (isCommitPhase) {
		return attendance.committed < attendance.waitedFor
			? {permitted: false, because: 'still-waiting-to-commit'}
			: {permitted: true, opens: 'the-reveal-phase'};
	}
	// Everything committed in this cycle has to have been opened. The contract
	// evaluates this at execution time, which is what makes it airtight there: a
	// reveal still in the mempool has not been counted, so an advance mined
	// before it REVERTS rather than stranding it. Here the same comparison is
	// made against a reading that may already be out of date, and that is the
	// benign direction - the worst case is a reverted transaction.
	return attendance.revealed < attendance.committed
		? {permitted: false, because: 'still-waiting-to-reveal'}
		: {permitted: true, opens: 'the-next-cycle'};
}

/**
 * WHEN THIS BROWSER PUSHES THE CYCLE, which is not the same question as whether
 * it may.
 *
 * - `when-nothing-else-will` (the default) pushes only under a policy with NO
 *   CLOCK. Under `manual` the cycle moves for no other reason, so a client that
 *   does not push leaves the game frozen with no error anywhere; under `timed`
 *   and `hybrid` the clock moves it on its own, so pushing spends the player's
 *   gas to buy a few seconds nobody asked for.
 * - `eagerly` also brings a `hybrid` cycle forward the moment unanimity permits
 *   it. That is the mode a short-cycle game on the hybrid policy wants, and it
 *   is opt-in because it is a spending decision rather than a correctness one.
 * - `never` leaves it entirely to {@link CycleAdvanceStore.advance} and to
 *   whoever else is playing.
 *
 * Note what none of these is: a choice about whether the advance is ALLOWED.
 * Anyone may call it in any of them, and a game where every client sets `never`
 * simply waits for somebody to press a button.
 */
export type AutoAdvance = 'when-nothing-else-will' | 'eagerly' | 'never';

export type CycleAdvanceState =
	/** Nothing to push, or nothing has been read yet. */
	| {step: 'Idle'}
	| {
			step: 'Advancing';
			cycleNumber: number;
			opens: 'the-reveal-phase' | 'the-next-cycle';
	  }
	/**
	 * An advance was sent and did not land.
	 *
	 * USUALLY BENIGN, and worth saying so wherever this is shown: the commonest
	 * cause is that somebody else advanced first, or that a reveal was still in
	 * the mempool when this one was mined. Both are the contract refusing to do
	 * something that is no longer true, and the next reading will say so.
	 */
	| {step: 'Failed'; cycleNumber: number; message: string; error: unknown}
	/**
	 * Asked to push, and this client refused.
	 *
	 * ONLY REACHABLE WHERE THE CONTRACT IS NOT THE JUDGE. Where it is, a hand
	 * press is deliberately sent and refused on chain, because the contract's
	 * answer is better than this file's copy of it. Where it is not, there is no
	 * better answer to defer to, and sending anyway would spend somebody's stake
	 * to find out.
	 */
	| {step: 'Refused'; cycleNumber: number; because: AdvanceRefusal};

export type CycleAdvanceStore = Readable<CycleAdvanceState> & {
	readonly value: CycleAdvanceState;
	/**
	 * Read the attendance and push if the rules already permit it.
	 *
	 * Called on a timer by {@link CycleAdvanceStore.start}, and worth calling
	 * directly at the moment this browser's own action may have completed
	 * unanimity - a commit that lands is exactly when the reveal phase becomes
	 * pushable, and waiting a whole poll interval to notice is the difference
	 * between a round that feels instant and one that does not.
	 *
	 * One pass runs at a time. A call that arrives while one is running is
	 * QUEUED and runs as a fresh pass once it ends; its promise resolves at once
	 * rather than waiting for that pass.
	 */
	check(): Promise<void>;
	/**
	 * Push now.
	 *
	 * For a button, and what it does depends on the one property this file cannot
	 * check. Where the contract is the judge it pushes WITHOUT asking whether the
	 * rules permit it, deliberately: the local reading is only a prediction, so a
	 * hand press lets the contract answer rather than this file's copy of its
	 * rules, and the worst case is one reverted transaction.
	 *
	 * Where the contract is NOT the judge that same press is the whole decision,
	 * so it is checked first - a fresh cycle reading, a fresh attendance read, and
	 * the verdict - and a refusal is reported as {@link CycleAdvanceState} rather
	 * than sent.
	 *
	 * Ignored while a check or another press is already deciding, because that
	 * pass is deciding exactly this; it is never queued behind one.
	 */
	advance(): Promise<void>;
	/** Begin watching. Returns the teardown. */
	start(): () => void;
};

/** The default retry floor and ceiling, in milliseconds. See below. */
const RETRY_BASE_MS = 2000;
const RETRY_CAP_MS = 30000;

export type CycleAdvanceDeps = {
	cycleInfo: CycleInfoStore;
	/** Reads the contract's attendance: who is waited for, and who has acted. */
	readAttendance: () => Promise<Attendance>;
	/** Sends the game's advance, and resolves once it has been mined. */
	advance: () => Promise<unknown>;
	/**
	 * DOES YOUR CONTRACT RE-CHECK THESE CONDITIONS AND REVERT?
	 *
	 * `true` means its advance enforces, at execution time, everything
	 * {@link advancePermitted} predicts: the policy, that somebody is waited for,
	 * that unanimity has been reached in the commit phase, and that every
	 * commitment in the cycle has been opened in the reveal phase. Then this
	 * client's copy is an optimisation and nothing is riding on it.
	 *
	 * `false` means it does not - typically because the unanimity guard is a TODO,
	 * which is the state of one game in this tree today. Then this client's copy
	 * is the only thing standing between a mistimed press and a player who loses
	 * what they staked without ever having been asked to act.
	 *
	 * NO DEFAULT, AND THAT IS THE POINT. The safe-looking answer is the one that
	 * matches the reference contract, so a default would hand every adopter the
	 * reassurance that only the reference game has earned. Read your own advance
	 * before answering: grep it for the tally, not for the function name.
	 */
	contractIsTheJudge: boolean;
	/**
	 * Re-read the cycle from the chain, if this policy has anything to re-read.
	 *
	 * Called after every ATTEMPT, successful or not, and both halves are the
	 * reason. After a success the phase has moved and nothing else would notice
	 * until the next poll; after a failure the likeliest explanation is that this
	 * browser's picture of the phase was already stale, which is exactly when
	 * asking again is worth a round trip.
	 *
	 * AND BEFORE A PUSH WHERE THE CONTRACT IS NOT THE JUDGE, which is the one
	 * place it is not merely an optimisation. A verdict is computed from the
	 * phase this browser last saw, and a phase one poll out of date is exactly
	 * how "everyone has committed, open the reveal phase" becomes "close the
	 * cycle on players who have not revealed". Where the contract judges, that
	 * mistake costs a reverted transaction; where it does not, it costs their
	 * stake. A game that supplies no `refreshCycle` is saying its cycle reading
	 * cannot go stale.
	 */
	refreshCycle?: () => Promise<void>;
	auto?: AutoAdvance;
	/** How often to look. Defaults to one second. */
	pollInterval?: number;
	/** Injectable clock, for the tests of the backoff below. */
	now?: () => number;
};

export function createCycleAdvance(
	params: CycleAdvanceDeps,
): CycleAdvanceStore {
	const {cycleInfo, readAttendance} = params;
	const contractIsTheJudge = params.contractIsTheJudge;
	const auto = params.auto ?? 'when-nothing-else-will';
	const pollInterval = params.pollInterval ?? 1000;
	const now = params.now ?? (() => Date.now());

	let $state: CycleAdvanceState = {step: 'Idle'};
	const store = writable<CycleAdvanceState>($state);

	function set(next: CycleAdvanceState) {
		$state = next;
		store.set(next);
	}

	/**
	 * ONE DECISION AT A TIME, CLAIMED BEFORE THE FIRST READ AND RELEASED IN A
	 * `finally`, and a check that arrives while one runs is QUEUED, not dropped.
	 *
	 * Claimed early because the decision is not the push, it is everything from
	 * the first read to the push: a flag set only inside the push left a window
	 * across every `await` before it (the attendance read, and on the sole-guard
	 * path two cycle refreshes), and a second caller entering that window passed
	 * the guard and sent a second advance. The pollers and the pokes are
	 * independent callers, so they do interleave. Where the contract is the judge
	 * the duplicate is one reverted transaction and a `Failed` this client caused
	 * itself. Where it is NOT, both are accepted and the cycle moves TWICE, which
	 * closes a cycle on players who have not revealed: the exact harm
	 * `contractIsTheJudge: false` exists to prevent.
	 *
	 * Released in a `finally` around the whole pass, never at an individual
	 * return, because a flag claimed and not released is worse than the duplicate
	 * it closes: under `manual` nothing else moves the cycle, so it is a world that
	 * stops with no error anywhere. No early return can skip a `finally`.
	 *
	 * QUEUED rather than dropped for the reason `createSerialisedLoop` in
	 * `./played.ts` gives: a poke arrives exactly when something just changed, so
	 * one arriving mid-pass is the likely case, and dropping it falls back to the
	 * poll - the second of latency the poke exists to remove. A queued check runs
	 * the WHOLE pass again, reads included, so it re-reads rather than re-pushes;
	 * and it cannot spin, because only a caller sets it.
	 *
	 * That loop is not reused, deliberately. The hand press has to share this
	 * exclusion and is DROPPED rather than queued (a press queued behind a check
	 * that already pushed would, where the contract judges, be an unconditional
	 * second send), and the loop has no way to express a second kind of pass or to
	 * refuse one; importing it would also tie this file to the played seats' module
	 * for ten lines of flag.
	 */
	let busy = false;
	let wanted = false;

	async function exclusively(first: () => Promise<void>): Promise<void> {
		busy = true;
		try {
			await first();
			while (wanted) {
				wanted = false;
				await checkOnce();
			}
		} finally {
			busy = false;
		}
	}

	/**
	 * BACKOFF THAT RESETS ON NEW INFORMATION, which is the shape this needs
	 * rather than a retry count.
	 *
	 * A failing advance must not be retried every second forever: each attempt
	 * spends gas, and the one failure that is NOT benign (a signer with nothing
	 * in it, a node refusing the send) would otherwise drain the key that plays.
	 * But a failure must not be sticky either: under `manual` nothing else moves
	 * the cycle, so a client that gave up permanently would leave the game frozen
	 * for everyone.
	 *
	 * So attempts back off exponentially while the situation is UNCHANGED, and
	 * the backoff resets the moment the chain says something new - a different
	 * phase, a different cycle, or a different tally. That is the honest reading
	 * of "is there any reason to think this will go differently now".
	 */
	let situation: string | undefined;
	let failures = 0;
	let retryAfter = 0;

	function situationOf(
		cycleNumber: number,
		isCommitPhase: boolean,
		attendance: Attendance,
	): string {
		return [
			cycleNumber,
			isCommitPhase ? 'commit' : 'reveal',
			attendance.waitedFor,
			attendance.committed,
			attendance.revealed,
		].join(':');
	}

	/**
	 * Is this browser one of the clients that should be pushing at all?
	 *
	 * Asked once per check rather than once at startup, so that it stays a
	 * statement about the DEPLOYMENT's policy: the policy is fixed for the life
	 * of a deployment, and reading it from the cycle rather than from a captured
	 * flag means there is no second copy to keep in step.
	 */
	function pushes(policy: CyclePolicy): boolean {
		if (auto === 'never') return false;
		// The contract refuses outright, so a poll here would be an RPC call per
		// second on every ordinary deployment in exchange for nothing. This is the
		// branch that keeps a timed game's traffic exactly what it was.
		if (policy === 'timed') return false;
		if (policy === 'manual') return true;
		return auto === 'eagerly';
	}

	async function push(
		cycleNumber: number,
		opens: 'the-reveal-phase' | 'the-next-cycle',
	): Promise<void> {
		set({step: 'Advancing', cycleNumber, opens});
		try {
			await params.advance();
			failures = 0;
			retryAfter = 0;
			set({step: 'Idle'});
		} catch (error) {
			failures += 1;
			retryAfter =
				now() +
				Math.min(RETRY_CAP_MS, RETRY_BASE_MS * Math.pow(2, failures - 1));
			set({
				step: 'Failed',
				cycleNumber,
				message: error instanceof Error ? error.message : String(error),
				error,
			});
		} finally {
			// See `refreshCycle`: an attempt is exactly when the local picture of
			// the phase is most likely to have moved on. Still inside the claim, so
			// a check queued meanwhile judges the phase this re-read returns.
			try {
				await params.refreshCycle?.();
			} catch {
				// A failed re-read is not a failed advance, and the poller that
				// owns the cycle will try again on its own interval.
			}
		}
	}

	async function check(): Promise<void> {
		if (busy) {
			wanted = true;
			return;
		}
		return exclusively(checkOnce);
	}

	/** One pass of {@link check}. Only ever called holding the claim. */
	async function checkOnce(): Promise<void> {
		const info = cycleInfo.now();
		if (!pushes(info.config.policy)) return;

		let attendance: Attendance;
		try {
			attendance = await readAttendance();
		} catch {
			// A failed read is not evidence that the cycle needs pushing, and it is
			// not evidence that it does not. Nothing changes.
			return;
		}

		const next = situationOf(
			info.currentCycleNumber,
			info.isCommitPhase,
			attendance,
		);
		if (next !== situation) {
			situation = next;
			failures = 0;
			retryAfter = 0;
		}
		if (now() < retryAfter) return;

		const verdict = advancePermitted({
			policy: info.config.policy,
			isCommitPhase: info.isCommitPhase,
			attendance,
		});
		if (!verdict.permitted) return;

		if (!contractIsTheJudge) {
			// THE ONE GUARD, so the phase it just judged has to be current. Read
			// again, and judge again on what came back: between the attendance read
			// and this one the cycle may have moved, and pushing on the old picture
			// is how a cycle gets closed on somebody who has not revealed.
			await refreshBeforePushing();
			const fresh = cycleInfo.now();
			const second = advancePermitted({
				policy: fresh.config.policy,
				isCommitPhase: fresh.isCommitPhase,
				attendance,
			});
			if (
				!second.permitted ||
				fresh.currentCycleNumber !== info.currentCycleNumber
			) {
				return;
			}
			await push(fresh.currentCycleNumber, second.opens);
			return;
		}

		await push(info.currentCycleNumber, verdict.opens);
	}

	async function advance(): Promise<void> {
		// Dropped, not queued: see `busy`. A pass is already deciding exactly this.
		if (busy) return;
		return exclusively(advanceOnce);
	}

	/** One hand press. Only ever called holding the claim. */
	async function advanceOnce(): Promise<void> {
		if (contractIsTheJudge) {
			// SENT WITHOUT ASKING, deliberately. The contract's answer is better
			// than this file's copy of it, and the cost of being wrong is one
			// reverted transaction.
			const info = cycleInfo.now();
			await push(
				info.currentCycleNumber,
				info.isCommitPhase ? 'the-reveal-phase' : 'the-next-cycle',
			);
			return;
		}

		// NOTHING ELSE WILL REFUSE THIS, so the press is checked before it is
		// spent - and against a FRESH reading, because the failure that costs a
		// stake is a phase one poll out of date rather than a tally that is
		// wrong.
		await refreshBeforePushing();
		const info = cycleInfo.now();

		let attendance: Attendance;
		try {
			attendance = await readAttendance();
		} catch (error) {
			set({
				step: 'Failed',
				cycleNumber: info.currentCycleNumber,
				message:
					'could not read who the cycle is waiting for, and this client is ' +
					'the only thing that checks',
				error,
			});
			return;
		}

		const verdict = advancePermitted({
			policy: info.config.policy,
			isCommitPhase: info.isCommitPhase,
			attendance,
		});
		if (!verdict.permitted) {
			set({
				step: 'Refused',
				cycleNumber: info.currentCycleNumber,
				because: verdict.because,
			});
			return;
		}

		await push(info.currentCycleNumber, verdict.opens);
	}

	/**
	 * Re-read the cycle before spending, and swallow a failure.
	 *
	 * A failed re-read leaves the reading this browser already had, which is the
	 * same position every other caller is in; it is not a reason to refuse, and
	 * it is not a reason to pretend the reading is fresh either. The verdict is
	 * computed from whatever the store holds afterwards.
	 */
	async function refreshBeforePushing(): Promise<void> {
		try {
			await params.refreshCycle?.();
		} catch {
			// See above: the caller carries on with the reading it had.
		}
	}

	function start(): () => void {
		// Off-browser (SSR / prerender) nothing polls and nothing sends: a server
		// render must not perform IO or leave a timer behind. See ADR-0002.
		if (typeof window === 'undefined') return () => {};
		if (!pushes(cycleInfo.now().config.policy)) return () => {};

		void check();
		const timer = setInterval(() => void check(), pollInterval);
		return () => clearInterval(timer);
	}

	return {
		get value() {
			return $state;
		},
		subscribe: store.subscribe,
		check,
		advance,
		start,
	};
}

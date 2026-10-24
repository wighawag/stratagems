import {describe, expect, it} from 'vitest';
import {writable} from 'svelte/store';
import {
	advancePermitted,
	createCycleAdvance,
	type Attendance,
	type AutoAdvance,
} from '$lib/game/core/advance';
import type {
	CycleConfig,
	CycleInfo,
	CycleInfoStore,
	CyclePolicy,
} from '$lib/game/core/cycle';

/**
 * A manual deployment's config: no clock, by construction.
 *
 * Both durations are zero because the CONTRACT refuses a configuration where
 * they disagree with the declared policy, so this is one fact and not three.
 */
function configFor(policy: CyclePolicy): CycleConfig {
	const clocked = policy !== 'manual';
	return {
		commitPhaseDuration: clocked ? 30 : 0,
		revealPhaseDuration: clocked ? 10 : 0,
		startTime: 0,
		commitTimeAllowance: clocked ? 10.1 : 0.1,
		policy,
	};
}

/** A cycle store the test moves by hand, as the chain would. */
function fakeCycles(params: {
	policy: CyclePolicy;
	cycleNumber?: number;
	isCommitPhase?: boolean;
}) {
	const config = configFor(params.policy);
	const state = writable<{cycleNumber: number; isCommitPhase: boolean}>({
		cycleNumber: params.cycleNumber ?? 2,
		isCommitPhase: params.isCommitPhase ?? true,
	});
	let $state = {
		cycleNumber: params.cycleNumber ?? 2,
		isCommitPhase: params.isCommitPhase ?? true,
	};
	state.subscribe((value) => ($state = value));

	const infoOf = (value: typeof $state): CycleInfo =>
		({
			type: params.policy === 'manual' ? 'manual' : params.policy,
			currentCycleNumber: value.cycleNumber,
			isCommitPhase: value.isCommitPhase,
			config,
		}) as CycleInfo;

	const cycleInfo: CycleInfoStore = {
		subscribe(run) {
			return state.subscribe((value) => run(infoOf(value)));
		},
		now: () => infoOf($state),
		fromTime: () => infoOf($state),
	};
	return {
		cycleInfo,
		move: (next: {cycleNumber: number; isCommitPhase: boolean}) =>
			state.set(next),
	};
}

function harness(params: {
	policy: CyclePolicy;
	attendance: Attendance;
	auto?: AutoAdvance;
	isCommitPhase?: boolean;
	fails?: boolean;
	now?: () => number;
	/**
	 * Defaults to the reference contract's answer, because that is what most of
	 * these cases are about. The cases that are about the OTHER answer say so.
	 */
	contractIsTheJudge?: boolean;
	/** Moves the cycle on during the refresh, to age a reading mid-decision. */
	onRefresh?: (cycles: ReturnType<typeof fakeCycles>) => void;
}) {
	const cycles = fakeCycles({
		policy: params.policy,
		isCommitPhase: params.isCommitPhase,
	});
	let attendance = params.attendance;
	let fails = params.fails ?? false;
	const sent: number[] = [];
	const refreshed: number[] = [];
	let reads = 0;

	const store = createCycleAdvance({
		cycleInfo: cycles.cycleInfo,
		readAttendance: async () => {
			reads++;
			return attendance;
		},
		advance: async () => {
			sent.push(sent.length);
			if (fails) throw new Error('someone else advanced first');
		},
		refreshCycle: async () => {
			refreshed.push(refreshed.length);
			params.onRefresh?.(cycles);
		},
		contractIsTheJudge: params.contractIsTheJudge ?? true,
		...(params.auto ? {auto: params.auto} : {}),
		...(params.now ? {now: params.now} : {}),
	});

	return {
		store,
		cycles,
		sent,
		refreshed,
		get reads() {
			return reads;
		},
		setAttendance: (next: Attendance) => (attendance = next),
		succeedFromNowOn: () => (fails = false),
		failFromNowOn: () => (fails = true),
	};
}

const alone: Attendance = {waitedFor: 1, committed: 0, revealed: 0};

describe('advancePermitted', () => {
	it('refuses under the timed policy, whatever the attendance says', () => {
		// The contract reverts with NextPhaseNotAllowed: the cycle simply IS what
		// the clock says, so there is nothing for anyone to push.
		expect(
			advancePermitted({
				policy: 'timed',
				isCommitPhase: true,
				attendance: {waitedFor: 1, committed: 1, revealed: 0},
			}),
		).toEqual({permitted: false, because: 'the-clock-decides'});
	});

	it('refuses when nobody is waited for', () => {
		// C1: no closed set, no denominator. Without it one caller could push an
		// empty game forward as fast as they liked.
		expect(
			advancePermitted({
				policy: 'manual',
				isCommitPhase: true,
				attendance: {waitedFor: 0, committed: 0, revealed: 0},
			}),
		).toEqual({permitted: false, because: 'nobody-is-waited-for'});
	});

	it('needs UNANIMITY to close the commit phase, not a majority', () => {
		// The rule this protects is one level up: if a subset could close a
		// phase, the fast players would time out the slow ones and committing
		// would have bought nothing.
		expect(
			advancePermitted({
				policy: 'manual',
				isCommitPhase: true,
				attendance: {waitedFor: 3, committed: 2, revealed: 0},
			}),
		).toEqual({permitted: false, because: 'still-waiting-to-commit'});
		expect(
			advancePermitted({
				policy: 'manual',
				isCommitPhase: true,
				attendance: {waitedFor: 3, committed: 3, revealed: 0},
			}),
		).toEqual({permitted: true, opens: 'the-reveal-phase'});
	});

	it('will not close a cycle while a commitment is still unopened', () => {
		// The one that would strand a turn: closing here would leave a commitment
		// that can never be revealed, and its bond forfeit.
		expect(
			advancePermitted({
				policy: 'manual',
				isCommitPhase: false,
				attendance: {waitedFor: 2, committed: 2, revealed: 1},
			}),
		).toEqual({permitted: false, because: 'still-waiting-to-reveal'});
		expect(
			advancePermitted({
				policy: 'manual',
				isCommitPhase: false,
				attendance: {waitedFor: 2, committed: 2, revealed: 2},
			}),
		).toEqual({permitted: true, opens: 'the-next-cycle'});
	});

	it('closes a cycle nobody committed in', () => {
		// Zero of zero is unanimity. A cycle where every member sat still still
		// has to be able to end, or a quiet cycle would freeze a manual game.
		expect(
			advancePermitted({
				policy: 'manual',
				isCommitPhase: false,
				attendance: {waitedFor: 2, committed: 0, revealed: 0},
			}),
		).toEqual({permitted: true, opens: 'the-next-cycle'});
	});

	it('permits an early advance under the hybrid policy', () => {
		expect(
			advancePermitted({
				policy: 'hybrid',
				isCommitPhase: true,
				attendance: {waitedFor: 1, committed: 1, revealed: 0},
			}),
		).toEqual({permitted: true, opens: 'the-reveal-phase'});
	});
});

describe('createCycleAdvance', () => {
	it('pushes the reveal phase open once everyone has committed', async () => {
		const h = harness({
			policy: 'manual',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
		});

		await h.store.check();

		expect(h.sent).toHaveLength(1);
		expect(h.store.value).toEqual({step: 'Idle'});
		// The local picture of the phase is now behind the chain by exactly one
		// transaction, which is the moment it is worth re-reading.
		expect(h.refreshed).toHaveLength(1);
	});

	it('sends nothing while the cycle is still waiting', async () => {
		const h = harness({policy: 'manual', attendance: alone});
		await h.store.check();
		expect(h.sent).toHaveLength(0);
		expect(h.store.value).toEqual({step: 'Idle'});
	});

	it('READS NOTHING AT ALL under the timed policy', async () => {
		// The branch that keeps an ordinary deployment's RPC traffic exactly what
		// it was: the contract would refuse, so polling for the chance would be
		// one call per second in exchange for nothing.
		const h = harness({
			policy: 'timed',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
		});
		await h.store.check();
		expect(h.reads).toBe(0);
		expect(h.sent).toHaveLength(0);
	});

	it('leaves a hybrid cycle to its clock unless asked to be eager', async () => {
		// Spending the player's gas to buy a few seconds is a decision, so it is
		// opt-in. The clock gets there on its own.
		const lazy = harness({
			policy: 'hybrid',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
		});
		await lazy.store.check();
		expect(lazy.sent).toHaveLength(0);

		const eager = harness({
			policy: 'hybrid',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
			auto: 'eagerly',
		});
		await eager.store.check();
		expect(eager.sent).toHaveLength(1);
	});

	it('never pushes when told never, even under manual', async () => {
		const h = harness({
			policy: 'manual',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
			auto: 'never',
		});
		await h.store.check();
		expect(h.sent).toHaveLength(0);

		// ...but a hand press still goes out. `never` is about what this browser
		// does by itself, not about what it is allowed to do.
		await h.store.advance();
		expect(h.sent).toHaveLength(1);
	});

	it('lets the CONTRACT judge a hand press, not the local reading', async () => {
		// The mirrored guard exists to save a doomed broadcast, not to overrule
		// the chain: a player pressing the button gets the contract's answer.
		const h = harness({policy: 'manual', attendance: alone});
		await h.store.advance();
		expect(h.sent).toHaveLength(1);
	});

	it('reports a failed advance without giving up on the cycle', async () => {
		let clock = 0;
		const h = harness({
			policy: 'manual',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
			fails: true,
			now: () => clock,
		});

		await h.store.check();
		expect(h.sent).toHaveLength(1);
		expect(h.store.value.step).toBe('Failed');

		// Nothing has changed, so an immediate retry would only spend gas to be
		// told the same thing.
		await h.store.check();
		expect(h.sent).toHaveLength(1);

		// The chain says something new - a reveal landed, a member joined - and
		// the backoff resets on the new information rather than on a timer.
		h.setAttendance({waitedFor: 2, committed: 2, revealed: 0});
		h.succeedFromNowOn();
		await h.store.check();
		expect(h.sent).toHaveLength(2);
		expect(h.store.value).toEqual({step: 'Idle'});
	});

	it('backs off exponentially while the situation is unchanged', async () => {
		// The failure that is NOT benign - a signer with nothing in it, a node
		// refusing the send - must not be retried every second forever, because
		// each attempt spends gas from the key that plays.
		let clock = 0;
		const h = harness({
			policy: 'manual',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
			fails: true,
			now: () => clock,
		});

		await h.store.check();
		expect(h.sent).toHaveLength(1);

		clock = 1999;
		await h.store.check();
		expect(h.sent).toHaveLength(1);

		clock = 2000;
		await h.store.check();
		expect(h.sent).toHaveLength(2);

		// Doubling: the second failure buys four seconds, not two.
		clock = 5999;
		await h.store.check();
		expect(h.sent).toHaveLength(2);
		clock = 6000;
		await h.store.check();
		expect(h.sent).toHaveLength(3);
	});

	it('does not send a second advance while one is in flight', async () => {
		let release: (() => void) | undefined;
		const cycles = fakeCycles({policy: 'manual'});
		const sent: number[] = [];
		const store = createCycleAdvance({
			cycleInfo: cycles.cycleInfo,
			readAttendance: async () => ({
				waitedFor: 1,
				committed: 1,
				revealed: 0,
			}),
			advance: () => {
				sent.push(sent.length);
				return new Promise<void>((resolve) => (release = resolve));
			},
			// The chain moved, as it does after an advance. Without this the fake
			// would still say "everyone committed, commit phase" afterwards, and the
			// check queued below would be right to push again.
			refreshCycle: async () =>
				cycles.move({cycleNumber: 2, isCommitPhase: false}),
			contractIsTheJudge: true,
		});

		const first = store.check();
		// Long enough for the read to resolve and the send to have started.
		await Promise.resolve();
		await Promise.resolve();
		await store.check();
		expect(sent).toHaveLength(1);
		expect(store.value.step).toBe('Advancing');

		release?.();
		await first;
		expect(store.value).toEqual({step: 'Idle'});
	});

	it('treats a failed attendance read as no information at all', async () => {
		const cycles = fakeCycles({policy: 'manual'});
		const sent: number[] = [];
		const store = createCycleAdvance({
			cycleInfo: cycles.cycleInfo,
			readAttendance: async () => {
				throw new Error('the node did not answer');
			},
			advance: async () => {
				sent.push(sent.length);
			},
			contractIsTheJudge: true,
		});

		await store.check();
		expect(sent).toHaveLength(0);
		// NOT an error state: nothing failed that the player has anything at
		// stake in, and the poller will ask again.
		expect(store.value).toEqual({step: 'Idle'});
	});

	it('starts no timer at all when this deployment needs no pushing', () => {
		const h = harness({
			policy: 'timed',
			attendance: {waitedFor: 1, committed: 1, revealed: 0},
		});
		const stop = h.store.start();
		stop();
		expect(h.reads).toBe(0);
	});
});

describe('when the contract is NOT the judge', () => {
	/**
	 * THE CASE A SECOND GAME IN THIS TREE IS IN TODAY. Its advance checks the
	 * policy and nothing else - the unanimity guard is a TODO in its own source -
	 * so this client's mirrored copy is the only thing that refuses. Being wrong
	 * in the lax direction there is not a reverted transaction, it is a reveal
	 * phase opened on somebody who never committed, and that game's stake is the
	 * avatar.
	 */
	const waiting: Attendance = {waitedFor: 3, committed: 2, revealed: 0};

	it('refuses a hand press instead of letting the chain answer', async () => {
		const h = harness({
			policy: 'manual',
			attendance: waiting,
			contractIsTheJudge: false,
		});

		await h.store.advance();

		expect(h.sent).toHaveLength(0);
		expect(h.store.value).toEqual({
			step: 'Refused',
			cycleNumber: 2,
			because: 'still-waiting-to-commit',
		});
	});

	it('still sends a hand press where the contract IS the judge', async () => {
		// The other half of the same behaviour, and the reason this is a
		// declaration rather than a rule: where the chain refuses, deferring to it
		// is better than deferring to this file's copy of its rules, and the press
		// costs one reverted transaction at worst.
		const h = harness({
			policy: 'manual',
			attendance: waiting,
			contractIsTheJudge: true,
		});

		await h.store.advance();

		expect(h.sent).toHaveLength(1);
	});

	it('re-reads the cycle before spending, and drops a verdict that has aged', async () => {
		// THE WINDOW THAT COSTS A STAKE. The verdict was computed from the phase
		// this browser last saw; if the cycle moved on while the attendance read
		// was in flight, "everyone has committed, open the reveal phase" becomes a
		// push against a cycle that is already in its reveal phase - which, with
		// nothing on chain to refuse it, closes that cycle on players who have not
		// revealed.
		const h = harness({
			policy: 'manual',
			attendance: {waitedFor: 2, committed: 2, revealed: 0},
			contractIsTheJudge: false,
			onRefresh: (cycles) => cycles.move({cycleNumber: 3, isCommitPhase: true}),
		});

		await h.store.check();

		expect(h.refreshed.length).toBeGreaterThan(0);
		expect(h.sent).toHaveLength(0);
	});

	it('pushes when the fresh reading agrees with the stale one', async () => {
		// The refresh is not a refusal: nothing changed, so the push happens. A
		// guard that refused whenever it re-read would freeze a manual cycle,
		// which is the failure on the other side of this one.
		const h = harness({
			policy: 'manual',
			attendance: {waitedFor: 2, committed: 2, revealed: 0},
			contractIsTheJudge: false,
		});

		await h.store.check();

		expect(h.sent).toHaveLength(1);
	});
});

describe('one decision at a time', () => {
	/**
	 * THE HOLE THESE CLOSE. The guard used to be read at the top of `check()` and
	 * set only inside `push()`, with at least one `await` between them, so a
	 * second caller entering that window passed it and both sent an advance. The
	 * poll and the pokes are independent callers, so it is reachable.
	 *
	 * WHY THESE ARE INTERLEAVING TESTS. The older in-flight test above waits until
	 * the push has started, which is exactly the case the old guard already
	 * covered. Here every read is HELD until the test lets it go, so both callers
	 * are inside the window at once.
	 */

	/**
	 * A chain the advance client can be wrong about.
	 *
	 * The client's picture of the phase moves only when it refreshes, so it can
	 * be stale; attendance is read live but held until released; an advance is
	 * MINED a macrotask after it is sent, so two sends made in the same window
	 * both go out before either lands. `judge` is the contract property itself:
	 * true refuses an advance the rules do not permit, false accepts any advance,
	 * which is what one game in this tree does today.
	 */
	function chain(params: {judge: boolean; attendance: Attendance}) {
		const cycles = fakeCycles({policy: 'manual'});
		const onChain = {
			cycleNumber: 2,
			isCommitPhase: true,
			attendance: params.attendance,
		};
		let clock = 0;
		let held: Promise<void> | undefined;
		let release: (() => void) | undefined;
		let readFailures = 0;
		const sent: number[] = [];
		const refused: string[] = [];

		const store = createCycleAdvance({
			cycleInfo: cycles.cycleInfo,
			readAttendance: async () => {
				// Answered as of when it was ASKED, as a node answers, however long
				// the answer then takes to arrive.
				const answer = onChain.attendance;
				if (held) await held;
				if (readFailures > 0) {
					readFailures--;
					throw new Error('the node did not answer');
				}
				return answer;
			},
			advance: async () => {
				sent.push(sent.length);
				await new Promise((resolve) => setTimeout(resolve, 0));
				const verdict = advancePermitted({
					policy: 'manual',
					isCommitPhase: onChain.isCommitPhase,
					attendance: onChain.attendance,
				});
				if (!verdict.permitted) {
					if (params.judge) {
						refused.push(verdict.because);
						throw new Error(verdict.because);
					}
				}
				if (onChain.isCommitPhase) {
					onChain.isCommitPhase = false;
				} else {
					onChain.cycleNumber += 1;
					onChain.isCommitPhase = true;
					onChain.attendance = {
						waitedFor: onChain.attendance.waitedFor,
						committed: 0,
						revealed: 0,
					};
				}
			},
			refreshCycle: async () =>
				cycles.move({
					cycleNumber: onChain.cycleNumber,
					isCommitPhase: onChain.isCommitPhase,
				}),
			contractIsTheJudge: params.judge,
			now: () => clock,
		});

		return {
			store,
			cycles,
			onChain,
			sent,
			refused,
			hold() {
				held = new Promise<void>((resolve) => (release = resolve));
			},
			release() {
				held = undefined;
				release?.();
			},
			failNextReads: (count: number) => (readFailures = count),
			setClock: (value: number) => (clock = value),
		};
	}

	/** Let every pending microtask and one macrotask run. */
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

	const allCommitted: Attendance = {waitedFor: 2, committed: 2, revealed: 0};

	describe('two checks interleaving across the attendance read', () => {
		it('send ONE advance where the contract is the judge', async () => {
			const c = chain({judge: true, attendance: allCommitted});
			c.hold();
			const first = c.store.check();
			const second = c.store.check();
			await settle();
			c.release();
			await Promise.all([first, second]);

			expect(c.sent).toHaveLength(1);
			// The duplicate used to come back as a refusal this client caused
			// itself, and feed the backoff a failure with no information in it.
			expect(c.refused).toEqual([]);
			expect(c.store.value).toEqual({step: 'Idle'});
		});

		it('send ONE advance where it is NOT, and the cycle moves once', async () => {
			// THE CASE THAT COSTS A STAKE. Nothing on chain refuses the second
			// advance, so it is accepted: the reveal phase opens and is closed
			// again at once, on players who have not revealed.
			const c = chain({judge: false, attendance: allCommitted});
			c.hold();
			const first = c.store.check();
			const second = c.store.check();
			await settle();
			c.release();
			await Promise.all([first, second]);

			// Asserted first so a regression fails on the harm, not the count.
			expect(c.onChain).toMatchObject({cycleNumber: 2, isCommitPhase: false});
			expect(c.sent).toHaveLength(1);
		});
	});

	describe('a check interleaving with a hand press', () => {
		it('a press during a check sends nothing more, where the contract judges', async () => {
			// The judge path sends a press without reading anything, so the old
			// guard let it straight through a check that was still reading.
			const c = chain({judge: true, attendance: allCommitted});
			c.hold();
			const check = c.store.check();
			await settle();
			const press = c.store.advance();
			c.release();
			await Promise.all([check, press]);

			expect(c.sent).toHaveLength(1);
			expect(c.refused).toEqual([]);
		});

		it('a press during a check sends nothing more, where it does not', async () => {
			const c = chain({judge: false, attendance: allCommitted});
			c.hold();
			const check = c.store.check();
			await settle();
			const press = c.store.advance();
			await settle();
			c.release();
			await Promise.all([check, press]);

			expect(c.sent).toHaveLength(1);
			expect(c.onChain).toMatchObject({cycleNumber: 2, isCommitPhase: false});
		});

		it('a check during a press re-reads after it rather than pushing again', async () => {
			// The sole-guard press has awaits of its own now (a refresh and a
			// read), so the window runs the other way too.
			const c = chain({judge: false, attendance: allCommitted});
			c.hold();
			const press = c.store.advance();
			await settle();
			const check = c.store.check();
			await settle();
			c.release();
			await Promise.all([press, check]);

			expect(c.sent).toHaveLength(1);
			expect(c.onChain).toMatchObject({cycleNumber: 2, isCommitPhase: false});
		});
	});

	it('QUEUES a check that arrives mid-pass, and runs it on a fresh read', async () => {
		// The poke is sent the moment something changed, so arriving while the
		// poll is mid-read is the likely case. Dropping it would leave the round
		// waiting on the next poll, which is the latency the poke exists to
		// remove.
		const c = chain({
			judge: true,
			attendance: {waitedFor: 2, committed: 1, revealed: 0},
		});
		c.hold();
		const poll = c.store.check();
		await settle();
		// The last commitment lands while the poll's read is in flight, so the
		// poll is answered with the old tally, and the poke that landing sends
		// arrives mid-pass.
		c.onChain.attendance = allCommitted;
		const poke = c.store.check();
		c.release();
		await Promise.all([poll, poke]);

		expect(c.sent).toHaveLength(1);
	});

	describe('every early return leaves the client able to advance', () => {
		/**
		 * A CLAIM THAT IS NEVER RELEASED IS WORSE THAN THE DUPLICATE IT CLOSES:
		 * under `manual` nothing else moves the cycle, so it is a world that stops
		 * with no error anywhere. Each case takes one early return and then asks
		 * for an advance that should obviously go out.
		 */

		it('after a failed attendance read', async () => {
			const c = chain({judge: true, attendance: allCommitted});
			c.failNextReads(1);
			await c.store.check();
			expect(c.sent).toHaveLength(0);

			await c.store.check();
			expect(c.sent).toHaveLength(1);
		});

		it('after a verdict that is not permitted', async () => {
			const c = chain({
				judge: true,
				attendance: {waitedFor: 2, committed: 1, revealed: 0},
			});
			await c.store.check();
			expect(c.sent).toHaveLength(0);

			c.onChain.attendance = allCommitted;
			await c.store.check();
			expect(c.sent).toHaveLength(1);
		});

		it('after a backoff that has not elapsed', async () => {
			// The chain refuses the first push because it is in the reveal phase
			// while this client still thinks commit; then, with nothing new read,
			// the next check stops at the backoff.
			const c = chain({judge: true, attendance: allCommitted});
			c.onChain.isCommitPhase = false;
			await c.store.check();
			expect(c.refused).toEqual(['still-waiting-to-reveal']);
			// The refresh after a failed attempt corrected the phase; put the
			// client's picture back so the situation is unchanged.
			c.cycles.move({cycleNumber: 2, isCommitPhase: true});
			await c.store.check();
			expect(c.sent).toHaveLength(1);

			c.onChain.isCommitPhase = true;
			c.setClock(2000);
			await c.store.check();
			expect(c.sent).toHaveLength(2);
			expect(c.store.value).toEqual({step: 'Idle'});
		});

		it('after refusing a reading that aged during the decision', async () => {
			const c = chain({judge: false, attendance: allCommitted});
			// The chain is already one advance ahead of what this client last saw.
			c.onChain.isCommitPhase = false;
			await c.store.check();
			expect(c.sent).toHaveLength(0);

			c.onChain.attendance = {waitedFor: 2, committed: 2, revealed: 2};
			await c.store.check();
			expect(c.sent).toHaveLength(1);
		});

		it('after a hand press that could not read the attendance', async () => {
			const c = chain({judge: false, attendance: allCommitted});
			c.failNextReads(1);
			await c.store.advance();
			expect(c.store.value.step).toBe('Failed');

			await c.store.check();
			expect(c.sent).toHaveLength(1);
		});

		it('after a hand press this client refused', async () => {
			const c = chain({
				judge: false,
				attendance: {waitedFor: 2, committed: 1, revealed: 0},
			});
			await c.store.advance();
			expect(c.store.value.step).toBe('Refused');

			c.onChain.attendance = allCommitted;
			await c.store.check();
			expect(c.sent).toHaveLength(1);
		});

		it('after a pass that threw', async () => {
			// No return is involved at all: the claim is released in a `finally`,
			// so even a pass that does not finish cannot keep it.
			const c = chain({judge: true, attendance: allCommitted});
			const now = c.cycles.cycleInfo.now;
			c.cycles.cycleInfo.now = () => {
				throw new Error('no cycle yet');
			};
			await expect(c.store.check()).rejects.toThrow('no cycle yet');

			c.cycles.cycleInfo.now = now;
			await c.store.check();
			expect(c.sent).toHaveLength(1);
		});
	});
});

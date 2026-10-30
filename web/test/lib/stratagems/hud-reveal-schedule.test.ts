import {describe, expect, it} from 'vitest';
import {get, writable} from 'svelte/store';
import {createHud, describeRevealSchedule} from '$lib/stratagems/hud/hud';
import type {Context} from '$lib/context/types';
import type {SubmissionState} from '$lib/game/core/submission';
import type {Move} from '$lib/stratagems/moves';
import type {FuzdSchedule, ScheduledReveal} from '$lib/fuzd';

/**
 * What stratagems' HUD says about WHO REVEALS the turn (`with/fuzd`, step 8):
 * scheduled, then fuzd's word in the reveal phase, or not scheduled. The same
 * cases as the reference game's own suite (`test/lib/placement/
 * hud-reveal-schedule.test.ts` on template-commit-reveal `with/fuzd`), on
 * stratagems' move and its HUD.
 */
type State = SubmissionState<Move>;

const SCHEDULE: FuzdSchedule = {
	chainId: '31337',
	account: '0x00000000000000000000000000000000000000aa',
	remoteAccount: '0x00000000000000000000000000000000000000fe',
	slot: 'cycle_3_0x00000000000000000000000000000000000000bb',
	cycleNumber: 3,
	batchSize: 1,
	scheduledAt: 1,
	revealDueAt: 100,
	expiryDelta: 10,
	inClear: true,
};

const committed = (revealScheduled?: boolean): State => ({
	step: 'Committed',
	cycleNumber: 3,
	actions: [{position: 1n, color: 1}],
	...(revealScheduled === undefined ? {} : {revealScheduled}),
});

const scheduled = (status?: ScheduledReveal['status']): ScheduledReveal => ({
	cycleNumber: 3,
	revealScheduled: true,
	schedule: SCHEDULE,
	...(status ? {status} : {}),
});

describe('what the stratagems HUD says about who reveals the turn', () => {
	it('says the turn will be revealed for the player once scheduled', () => {
		const line = describeRevealSchedule(scheduled(), committed(true));
		expect(line?.step).toBe('scheduled');
		expect(line?.label).toMatch(
			/revealed for you, even if you close this page/i,
		);
	});

	it("shows fuzd's status in the reveal phase", () => {
		expect(
			describeRevealSchedule(
				scheduled({step: 'broadcast', sent: 0, total: 1}),
				committed(true),
			)?.label,
		).toBe('Being revealed for you...');
		expect(
			describeRevealSchedule(scheduled({step: 'confirmed'}), {
				step: 'Revealed',
				cycleNumber: 3,
			})?.step,
		).toBe('confirmed');
		const failed = describeRevealSchedule(
			scheduled({step: 'failed', reason: 'a reveal transaction failed'}),
			committed(true),
		);
		expect(failed?.tone).toBe('bad');
		expect(failed?.label).toMatch(/this browser is revealing it/);
		expect(
			describeRevealSchedule(scheduled({step: 'unreachable'}), committed(true))
				?.step,
		).toBe('unreachable');
	});

	it('says not scheduled when scheduling failed, while the turn is owed', () => {
		const line = describeRevealSchedule(
			{cycleNumber: 3, revealScheduled: false},
			committed(false),
		);
		expect(line?.step).toBe('not-scheduled');
		expect(line?.label).toMatch(/keep this page open/i);
		expect(
			describeRevealSchedule(
				{cycleNumber: 3, revealScheduled: false},
				{step: 'Revealed', cycleNumber: 3},
			),
		).toBeUndefined();
	});

	it('says nothing without a scheduler, or for a turn this browser revealed', () => {
		expect(describeRevealSchedule(undefined, committed())).toBeUndefined();
		expect(
			describeRevealSchedule({cycleNumber: 3}, committed()),
		).toBeUndefined();
		expect(
			describeRevealSchedule(scheduled(), {step: 'Revealed', cycleNumber: 3}),
		).toBeUndefined();
		// another cycle's schedule says nothing about this one
		expect(
			describeRevealSchedule(scheduled(), {
				step: 'Committed',
				cycleNumber: 4,
				actions: [{position: 1n, color: 1}],
			}),
		).toBeUndefined();
	});

	it("reaches the HUD model from stratagems' game context", () => {
		const revealSchedule = writable<ScheduledReveal | undefined>(scheduled());
		const context = {
			hasLocalSigner: true,
			deployments: {
				get: () => ({chain: {nativeCurrency: {symbol: 'ETH', decimals: 18}}}),
			},
			game: {
				config: {currency: {decimals: 18}},
				twoPhase: writable({phase: 'reveal', timeLeft: 5, duration: 10}),
				phase: writable('reveal'),
				submission: writable(committed(true)),
				planning: {count: writable(0), maxActions: writable(undefined)},
				cost: writable(0n),
				reserve: writable({step: 'Loaded', amount: 100n}),
				cycleInfo: writable({currentCycleNumber: 3}),
				missedReveal: writable({step: 'Clear'}),
				setup: writable(undefined),
				acquisition: writable({step: 'Idle'}),
				recovery: writable({step: 'Idle'}),
				revealSchedule,
			},
		} as unknown as Context;
		const hud = createHud(context);
		expect(get(hud).revealSchedule?.step).toBe('scheduled');
		revealSchedule.set(scheduled({step: 'confirmed'}));
		expect(get(hud).revealSchedule?.step).toBe('confirmed');
		revealSchedule.set(undefined);
		expect(get(hud).revealSchedule).toBeUndefined();
	});
});

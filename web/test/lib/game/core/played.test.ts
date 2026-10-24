import {describe, it, expect, vi} from 'vitest';
import {writable} from 'svelte/store';
import {
	createSerialisedLoop,
	pokeWhenTheHumanActs,
} from '$lib/game/core/played';

/**
 * THE LOOP THAT PLAYS THE SEATS NOBODY IS SITTING IN, on its own.
 *
 * NEW COVERAGE RATHER THAN MOVED COVERAGE, and that is worth saying because the
 * rest of this extraction is a move. This machinery was previously only ever
 * exercised through a whole world - a chain in the process, a real deploy, three
 * enrolled members (`test/lib/offline-players.test.ts`) - which asserts that a
 * round completes and therefore cannot say WHY the queueing matters. The
 * argument for queueing a poke rather than dropping it is a measurement about
 * latency, so a suite that only checks the round eventually closed would stay
 * green if the queue were deleted and the poll picked the work up a second
 * later.
 *
 * `createPlayedKeys` is deliberately not faked here: what it does is send a
 * transaction and wait for a block, and the honest test of that is a chain. The
 * world suite has one.
 */
/** A pass long enough that a second tick lands inside it. */
function sleep(ms = 5): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('the played-seat loop', () => {
	it('runs one pass at a time', async () => {
		// Two passes in flight would send two commitments for one member at one
		// nonce, which is the failure this exists to prevent.
		let inFlight = 0;
		let most = 0;
		const loop = createSerialisedLoop({
			pass: async () => {
				inFlight++;
				most = Math.max(most, inFlight);
				await sleep();
				inFlight--;
				return false;
			},
		});

		await Promise.all([loop.tick(), loop.tick(), loop.tick()]);

		expect(most).toBe(1);
	});

	it('queues a poke that arrives DURING a pass, instead of dropping it', async () => {
		// THE MEASURED HALF. A pass takes as long as the transactions in it, so a
		// poke arriving mid-pass is the likely case - the human's commit lands
		// while these seats are still looking at the phase it just changed. A
		// dropped poke falls back to the poll, which is the second of latency the
		// poke exists to remove, and nothing else would ever notice.
		//
		// ONE MORE PASS AND NOT TWO, which is the other half of the same property:
		// two pokes during one pass are one thing to go and look at, so what is
		// queued is a flag rather than a count.
		let passes = 0;
		const loop = createSerialisedLoop({
			pass: async () => {
				passes++;
				await sleep();
				return false;
			},
		});

		const running = loop.tick();
		await loop.tick(); // both of these arrive while the first pass is going
		await loop.tick();
		await running;

		expect(passes).toBe(2);
	});

	it('does not spin when nothing asked while a pass ran', async () => {
		let passes = 0;
		const loop = createSerialisedLoop({
			pass: async () => {
				passes++;
				return true;
			},
		});
		await loop.tick();
		expect(passes).toBe(1);
	});

	it('reports a pass that sent something, and says nothing about one that did not', async () => {
		// A played commit is exactly the moment unanimity may have been completed,
		// and the client that pushes the cycle would otherwise find out on its own
		// one-second poll. Firing on a pass that sent NOTHING would be a poll of
		// its own, at this loop's interval, for a world where nothing changed.
		let acted = 0;
		let sent = true;
		const loop = createSerialisedLoop({
			pass: async () => sent,
			onActed: () => void acted++,
		});

		await loop.tick();
		expect(acted).toBe(1);

		sent = false;
		await loop.tick();
		expect(acted).toBe(1);
	});

	it('leaves no timer behind off-browser', () => {
		// A server render must not perform IO or leave a timer behind (ADR-0002),
		// and a world that polled during prerender would be doing both.
		const interval = vi.spyOn(globalThis, 'setInterval');
		try {
			vi.stubGlobal('window', undefined);
			let passes = 0;
			const loop = createSerialisedLoop({
				pass: async () => {
					passes++;
					return false;
				},
			});
			const stop = loop.start();
			stop();
			expect(passes).toBe(0);
			expect(interval).not.toHaveBeenCalled();
		} finally {
			interval.mockRestore();
			vi.unstubAllGlobals();
		}
	});
});

describe('poking the loop when the human acts', () => {
	it('ticks on the two states that mean a transaction landed, and no other', async () => {
		const submission = writable<{step: string}>({step: 'Idle'});
		let ticks = 0;
		const stop = pokeWhenTheHumanActs({
			loop: {tick: async () => void ticks++},
			submission,
		});

		submission.set({step: 'Planning'});
		submission.set({step: 'Committing'});
		expect(ticks).toBe(0);

		submission.set({step: 'Committed'});
		submission.set({step: 'Revealed'});
		expect(ticks).toBe(2);

		stop();
		submission.set({step: 'Committed'});
		expect(ticks).toBe(2);
	});
});

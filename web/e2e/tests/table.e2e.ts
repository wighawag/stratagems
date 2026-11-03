import type {Page} from '@playwright/test';
import {test, expect, describe, connectPageAs} from '../fixtures/test';
import {
	authoriseToPlay,
	planOnCanvas,
	stake,
	submissionStep,
} from '../fixtures/game';

/**
 * A TABLE, end to end, in two browsers: a game for a fixed set of players at
 * an address of its own, created from the lobby to play three cycles, joined by
 * its link, started by its creator, played, a vanished member forfeited, and
 * played to its end.
 *
 * TWO BROWSERS BECAUSE THAT IS WHAT A TABLE IS. Every rule here is about the
 * OTHER player: the early advance waits for everyone, the clock is what moves a
 * table on when somebody stops, and the forfeit is the creator's answer to a
 * member who went quiet. One browser cannot be absent.
 *
 * The contracts suite (`contracts/test/js/Lobby.test.ts`) proves the rules;
 * this proves the client composes a context on a table's address and drives
 * them: the stake through the sale's `purchaseAt`, the delegation at the table
 * (the table is its own registry), the creator's two transactions, and the
 * eager advance.
 */

/** The table's cycle, read off the chain through the page's own client. */
async function cycleOf(page: Page): Promise<{
	cycleNumber: number;
	commiting: boolean;
	phaseStart: number;
	phaseEnd: number;
}> {
	return page.evaluate(async () => {
		const context = (globalThis as unknown as {context: any}).context;
		const game = context.deployments.get().contracts.Game;
		const cycle = await context.publicClient.readContract({
			address: game.address,
			abi: game.abi,
			functionName: 'getCycle',
		});
		return {
			cycleNumber: Number(cycle.cycleNumber),
			commiting: cycle.commiting,
			phaseStart: Number(cycle.phaseStart),
			phaseEnd: Number(cycle.phaseEnd),
		};
	});
}

/** The table's roster as the page's table store last read it. */
async function rosterOf(
	page: Page,
): Promise<{members: number; started: boolean} | undefined> {
	return page.evaluate(() => {
		const context = (globalThis as unknown as {context: any}).context;
		let value: any;
		const stop = context.game.table.subscribe((v: unknown) => (value = v));
		stop();
		return value.step === 'Loaded'
			? {
					members: value.roster.members.length,
					started: value.roster.started,
				}
			: undefined;
	});
}

/**
 * Wait until the board takes a turn: the stake has been READ back, not only
 * sent. The roster and the reserve are two reads on two clocks, so a member
 * the table already shows as seated can still be behind the setup gate.
 */
async function readyToPlay(page: Page): Promise<void> {
	await expect
		.poll(() => canPlay(page), {
			message: 'the board should take a turn',
			timeout: 60_000,
		})
		.toBe(true);
}

/** Whether the board takes a turn right now. */
async function canPlay(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const context = (globalThis as unknown as {context: any}).context;
		let value = false;
		const stop = context.game.readyToPlay.subscribe(
			(v: boolean) => (value = v),
		);
		stop();
		return value;
	});
}

async function commitNow(page: Page): Promise<void> {
	const commit = page.getByRole('button', {name: /commit now/i});
	if (await commit.isEnabled().catch(() => false)) {
		await commit.click().catch(() => {});
	}
	await expect
		.poll(async () => (await submissionStep(page)).step, {
			message: 'the commitment should reach the chain',
			timeout: 90_000,
		})
		.toBe('Committed');
}

describe('A table for a fixed set of players', () => {
	// The creator's account, a claim `test/e2e-account-claims.test.ts` checks:
	// nine, because `with/fuzd` claims seven and eight for its own two suites
	// and every node has to agree. The guest's is NOT a claim: it connects in a
	// browser context of its own, whose burner generates a fresh mnemonic, so
	// its first account is nobody else's.
	test.use({walletAccountIndex: 9});

	test('is created, joined by link, started, advanced early and by the clock, a vanished member forfeited, and played to its end', async ({
		connectedPage,
		browser,
		authoriseBrowser,
	}) => {
		// Three cycles of a 45 s commit phase and a 15 s reveal, two browsers.
		test.setTimeout(600_000);
		const host = connectedPage;

		// CREATE, from the lobby.
		await host.goto('/lobby/');
		await host.getByTestId('table-seats-2').click();
		// THREE CYCLES, the fewest this story needs: one advanced early, one by
		// the clock, and the one the forfeit is in, after which it has ended.
		await host.getByTestId('table-cycles').fill('3');
		await host.getByTestId('table-create').click();
		await host.waitForURL(/[?&]game=0x[0-9a-fA-F]{40}/, {timeout: 90_000});
		const table = new URL(host.url()).searchParams.get('game');
		if (!table) throw new Error('the lobby did not open the table');
		await expect(host.locator('canvas')).toBeVisible({timeout: 30_000});
		// BEFORE THE START THE PAGE IS THE TABLE'S LOBBY: what it plays by, who
		// is seated, and the seat to take.
		await expect(host.getByTestId('table-lobby')).toBeVisible();
		await expect(
			host.getByTestId('table-lobby').getByTestId('table-cycles'),
		).toHaveText('3');

		// The context is AT the table: its game is the table's address, so every
		// transaction below goes there and nowhere else.
		expect(
			(
				await host.evaluate(
					() =>
						(globalThis as unknown as {context: any}).context.deployments.get()
							.contracts.Game.address as string,
				)
			).toLowerCase(),
		).toBe(table.toLowerCase());

		// THE CREATOR TAKES A SEAT the way anyone does: by staking at the table.
		await stake(host);
		await authoriseToPlay(host, authoriseBrowser);
		await expect
			.poll(async () => (await rosterOf(host))?.members, {
				message: 'the creator should be seated by their stake',
				timeout: 60_000,
			})
			.toBe(1);
		// One seated is not a game: the start waits for a second.
		await expect(host.getByTestId('table-start')).toBeDisabled();

		// THE GUEST, in a browser of their own, from the invite link.
		const guestContext = await browser.newContext({
			storageState: {cookies: [], origins: []},
		});
		const guest = await guestContext.newPage();
		let second: Awaited<ReturnType<typeof cycleOf>>;
		try {
			await connectPageAs(guest, 0, `/play/?game=${table}`);
			await expect(guest.getByTestId('table-lobby')).toBeVisible();
			// Nobody but the creator is offered the start.
			await expect(guest.getByTestId('table-start')).toHaveCount(0);
			await stake(guest);
			await authoriseToPlay(guest, authoriseBrowser);
			await expect
				.poll(async () => (await rosterOf(host))?.members, {
					message: 'the guest should take the second seat',
					timeout: 60_000,
				})
				.toBe(2);
			// Seated, and still not playing: the guest waits for the creator, and
			// the board takes no turn until the table has started.
			await expect(guest.getByTestId('table-status')).toContainText(
				/waiting for the creator/i,
			);
			expect(await canPlay(guest)).toBe(false);

			// START: the roster closes and the clock is anchored at the press.
			await expect(host.getByTestId('table-start')).toBeEnabled({
				timeout: 30_000,
			});
			await host.getByTestId('table-start').click();
			await expect
				.poll(async () => (await rosterOf(host))?.started, {
					message: 'the creator should start the table',
					timeout: 60_000,
				})
				.toBe(true);
			// The lobby gives way to the board, for both.
			await expect(host.getByTestId('table-lobby')).toBeHidden({
				timeout: 30_000,
			});
			await expect(guest.getByTestId('table-lobby')).toBeHidden({
				timeout: 30_000,
			});
			const first = await cycleOf(host);
			expect(first.commiting).toBe(true);
			await expect(host.getByTestId('table-progress')).toHaveText(
				'Cycle 1 of 3',
				{timeout: 30_000},
			);

			// CYCLE ONE, ADVANCED EARLY: both commit, so the reveal phase opens
			// before the commit phase's nominal end, and both reveal, so the next
			// cycle starts before the reveal phase's.
			// Each page brought to the front before it is clicked, as a person
			// switching windows would.
			await host.bringToFront();
			await readyToPlay(host);
			await planOnCanvas(host, {x: 40, y: 30});
			await guest.bringToFront();
			await readyToPlay(guest);
			await planOnCanvas(guest, {x: -60, y: 40});
			await commitNow(host);
			await commitNow(guest);
			await expect
				.poll(async () => (await cycleOf(host)).commiting, {
					message:
						'the reveal phase should open as soon as both have committed',
					timeout: 60_000,
				})
				.toBe(false);
			const firstReveal = await cycleOf(host);
			expect(firstReveal.cycleNumber).toBe(first.cycleNumber);
			expect(
				firstReveal.phaseStart,
				'the reveal phase should have opened before the clock would have opened it',
			).toBeLessThan(first.phaseEnd);
			for (const page of [host, guest]) {
				await expect
					.poll(async () => (await submissionStep(page)).step, {
						message: 'each submission should reveal itself',
						timeout: 90_000,
					})
					.toBe('Revealed');
			}
			await expect
				.poll(async () => (await cycleOf(host)).cycleNumber, {
					message: 'the next cycle should start once both have revealed',
					timeout: 60_000,
				})
				.toBe(first.cycleNumber + 1);
			second = await cycleOf(host);
			expect(second.commiting).toBe(true);
			expect(
				second.phaseStart,
				'the next cycle should have started before the reveal phase ran out',
			).toBeLessThan(firstReveal.phaseEnd);
		} finally {
			// THE GUEST VANISHES: closes the tab and is never seen again.
			await guestContext.close();
		}

		// CYCLE TWO, ADVANCED BY THE CLOCK: the creator commits, the guest is
		// gone, so nothing can open the reveal phase early and the clock does.
		await host.bringToFront();
		await readyToPlay(host);
		await planOnCanvas(host, {x: 70, y: 50});
		await commitNow(host);
		await expect
			.poll(async () => (await cycleOf(host)).commiting, {
				message: 'the clock should open the reveal phase',
				timeout: 120_000,
			})
			.toBe(false);
		const secondReveal = await cycleOf(host);
		expect(secondReveal.cycleNumber).toBe(second.cycleNumber);
		expect(
			secondReveal.phaseStart,
			'with one member absent the reveal phase opens on the clock, not before',
		).toBe(second.phaseEnd);
		await expect
			.poll(async () => (await submissionStep(host)).step, {
				message: 'the creator should still reveal',
				timeout: 90_000,
			})
			.toBe('Revealed');
		await expect
			.poll(async () => (await cycleOf(host)).cycleNumber, {
				message: 'the next cycle should come with the clock',
				timeout: 120_000,
			})
			.toBe(second.cycleNumber + 1);

		// THE FORFEIT: the creator removes the member who has not acted in this
		// commit phase, and the table waits for them no longer.
		const forfeit = host.getByTestId('table-forfeit');
		await expect(forfeit).toBeVisible({timeout: 30_000});
		await forfeit.click();
		await expect
			.poll(async () => (await rosterOf(host))?.members, {
				message: 'the vanished member should be forfeited',
				timeout: 60_000,
			})
			.toBe(1);

		// THE LAST CYCLE, alone: the one member left commits and reveals, both
		// phases close early, and the table has played its three cycles.
		await expect(host.getByTestId('table-progress')).toHaveText('Cycle 3 of 3');
		await readyToPlay(host);
		await planOnCanvas(host, {x: 90, y: 60});
		await commitNow(host);
		await expect
			.poll(async () => (await submissionStep(host)).step, {
				message: 'the last turn should be revealed',
				timeout: 90_000,
			})
			.toBe('Revealed');
		await expect(host.getByTestId('table-progress')).toHaveText(
			'Ended after 3 cycles',
			{timeout: 60_000},
		);
		// After the end the board takes no turn, and the creator has nobody to
		// forfeit.
		expect(await canPlay(host)).toBe(false);
		await expect(host.getByTestId('table-forfeit')).toHaveCount(0);
	});
});

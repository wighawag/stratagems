import type {Page} from '@playwright/test';
import {
	test,
	expect,
	describe,
	connectPageAs,
	isWalletConnected,
	waitForAppReady,
} from '../fixtures/test';
import {
	authoriseToPlay,
	boardLoaded,
	clickCell,
	gameStep,
	getTestGems,
	stake,
	planCell,
} from '../fixtures/stratagems';

/**
 * A STRATAGEMS TABLE, end to end, in two browsers (step L2 of
 * work/plans/join-template-commit-reveal.md): a game for a fixed set of
 * players at an address of its own, created from the lobby, joined by its
 * link, started by its creator, played, and a vanished member forfeited. The
 * template's `table.e2e.ts` for stratagems. Since step L4, a second story: a
 * table with its own stake and board, played to its end, settled, and the
 * same winner shown in both browsers.
 *
 * TWO BROWSERS BECAUSE THAT IS WHAT A TABLE IS: the early advance waits for
 * everyone, the clock is what moves a table on when somebody stops, and the
 * forfeit is the creator's answer to a member who went quiet.
 *
 * The contracts suite (`contracts/test/Stratagems.table.test.ts`) proves the
 * rules; this proves the client composes a context on a table's address and
 * drives them: a seat taken by approving the table for the stake and staking
 * (PL2-1, a table has no global approval), the delegation at the table, the
 * creator's two transactions, the eager advance, and the board folded from
 * the table's own events.
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
		const game = context.deployments.get().contracts.Stratagems;
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

/** Wait until the board takes a turn: the stake read back, not only sent. */
async function readyToPlay(page: Page): Promise<void> {
	await expect
		.poll(() => canPlay(page), {
			message: 'the board should take a turn',
			timeout: 60_000,
		})
		.toBe(true);
}

/** A timestamped line in the run's output: where the table and the page are. */
async function trace(page: Page, label: string): Promise<void> {
	const cycle = await cycleOf(page).catch(() => undefined);
	const step = await gameStep(page).catch(() => undefined);
	console.log(
		`[table e2e] ${new Date().toISOString()} ${label}: cycle ${cycle?.cycleNumber} ${cycle?.commiting ? 'commit' : 'reveal'} ends ${cycle?.phaseEnd}, submission ${step?.step} planned ${step?.planned} phase ${step?.phase} ${step?.timeLeft}s, ready ${await canPlay(page).catch(() => undefined)}`,
	);
}

/**
 * The lobby, with the connection back. `goto` is a page load, after which the
 * connected account is RESTORED, not kept: a create clicked before that is
 * asked to connect a wallet, and opens the account picker instead of a table
 * (measured 2026-11-12 in the full suite, the second story's host showing
 * "Connect a wallet to create a table" for its whole 90 s).
 */
async function openLobby(page: Page): Promise<void> {
	await page.goto('/lobby/');
	await waitForAppReady(page);
	await expect
		.poll(() => isWalletConnected(page), {
			message: 'the lobby should have its account back',
			timeout: 30_000,
		})
		.toBe(true);
}

/** Plan one placement on `cell`, a cell of this player's alone this cycle. */
async function planAt(page: Page, cell: {x: number; y: number}) {
	await page.bringToFront();
	await trace(page, `planAt(${cell.x},${cell.y}) start`);
	await readyToPlay(page);
	await trace(page, 'ready');
	await boardLoaded(page);
	await trace(page, 'board loaded');
	await planCell(page, cell, {timeout: 30_000});
	await trace(page, 'planned');
}

async function commitNow(page: Page): Promise<void> {
	// In front, as a person switching windows would be: a click on a page in
	// the background was lost once (the commit then came from the auto-commit
	// at the phase's end, which is too late for an early advance).
	await page.bringToFront();
	await trace(page, 'commitNow start');
	const commit = page.getByRole('button', {name: /commit now/i});
	await expect(commit, 'the turn should be committable').toBeEnabled({
		timeout: 30_000,
	});
	await commit.click();
	await expect
		.poll(async () => (await gameStep(page)).step, {
			message: 'the commitment should reach the chain',
			timeout: 90_000,
		})
		.toMatch(/^(Committed|Revealing|Revealed)$/);
	await trace(page, 'committed');
}

/** The tokens' allowance from `owner` to the table: what PL2-1's approval left. */
async function allowanceAt(page: Page, owner: string): Promise<bigint> {
	return BigInt(
		await page.evaluate(async (owner) => {
			const context = (globalThis as unknown as {context: any}).context;
			const {contracts} = context.deployments.get();
			const allowance = await context.publicClient.readContract({
				address: contracts.TestTokens.address,
				abi: contracts.TestTokens.abi,
				functionName: 'allowance',
				args: [owner, contracts.Stratagems.address],
			});
			return allowance.toString();
		}, owner),
	);
}

async function accountOf(page: Page): Promise<string> {
	return page.evaluate(() => {
		const context = (globalThis as unknown as {context: any}).context;
		let value: any;
		const stop = context.account.subscribe((v: unknown) => (value = v));
		stop();
		return value as string;
	});
}

describe('A stratagems table for a fixed set of players', () => {
	// ONE AFTER THE OTHER: both stories play as the same claimed account, and
	// two of its transactions at once would race for its nonce
	test.describe.configure({mode: 'serial'});
	// The creator's account, a claim `test/e2e-account-claims.test.ts` checks.
	// The guest's is NOT a claim: it connects in a browser context of its own,
	// whose burner generates a fresh mnemonic, so its accounts are nobody else's.
	test.use({walletAccountIndex: 4});

	test('is created, joined by link, started, advanced early and by the clock, and a vanished member forfeited', async ({
		connectedPage,
		browser,
		authoriseBrowser,
	}) => {
		// Three cycles of a 45 s commit phase and a 15 s reveal, two browsers.
		test.setTimeout(600_000);
		const host = connectedPage;

		// CREATE, from the lobby.
		await openLobby(host);
		await host.getByTestId('table-seats-2').click();
		await host.getByTestId('table-create').click();
		await host.waitForURL(/[?&]game=0x[0-9a-fA-F]{40}/, {timeout: 90_000});
		const table = new URL(host.url()).searchParams.get('game');
		if (!table) throw new Error('the lobby did not open the table');
		await expect(host.locator('canvas')).toBeVisible({timeout: 30_000});
		await expect(host.getByTestId('table-lobby')).toBeVisible();

		// The context is AT the table: Stratagems is the table's address, and the
		// simulation and the generator are the table's (PL2-5).
		const records = await host.evaluate(() => {
			const {contracts} = (
				globalThis as unknown as {context: any}
			).context.deployments.get();
			return {
				game: contracts.Stratagems.address as string,
				generator: contracts.GemsGenerator.address as string,
				noRewards: contracts.NoRewards.address as string,
			};
		});
		expect(records.game.toLowerCase()).toBe(table.toLowerCase());
		expect(records.generator).toBe(records.noRewards);

		// THE CREATOR TAKES A SEAT the way anyone does: gems from the HUD, then
		// the stake, which approves the table for exactly the stake first.
		await getTestGems(host);
		await stake(host);
		await authoriseToPlay(host, authoriseBrowser);
		await expect
			.poll(async () => (await rosterOf(host))?.members, {
				message: 'the creator should be seated by their stake',
				timeout: 60_000,
			})
			.toBe(1);
		// the approval was exactly the stake, and the stake spent all of it
		expect(await allowanceAt(host, await accountOf(host))).toBe(0n);
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
			await expect(guest.getByTestId('table-start')).toHaveCount(0);
			await getTestGems(guest);
			await stake(guest);
			await authoriseToPlay(guest, authoriseBrowser);
			await expect
				.poll(async () => (await rosterOf(host))?.members, {
					message: 'the guest should take the second seat',
					timeout: 60_000,
				})
				.toBe(2);
			// Seated, and still not playing: the guest waits for the creator.
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
			await expect(host.getByTestId('table-lobby')).toBeHidden({
				timeout: 30_000,
			});
			await expect(guest.getByTestId('table-lobby')).toBeHidden({
				timeout: 30_000,
			});
			const first = await cycleOf(host);
			expect(first.commiting).toBe(true);

			// CYCLE ONE, ADVANCED EARLY: both commit, so the reveal phase opens
			// before the commit phase's nominal end, and both reveal, so the next
			// cycle starts before the reveal phase's.
			await planAt(host, {x: 2, y: 2});
			await planAt(guest, {x: -3, y: -3});
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
					.poll(async () => (await gameStep(page)).step, {
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
		await planAt(host, {x: 0, y: 2});
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
			.poll(async () => (await gameStep(host)).step, {
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

		// THE BOARD IS THE TABLE'S, folded by the indexer from its own events:
		// both of the creator's cells, the guest's, and nothing earned.
		await expect
			.poll(
				() =>
					host.evaluate(() => {
						const context = (globalThis as unknown as {context: any}).context;
						let value: any;
						const stop = context.onchainState.subscribe(
							(v: unknown) => (value = v),
						);
						stop();
						return value.step === 'Loaded'
							? Object.keys(value.data.owners).length
							: 0;
					}),
				{
					message: 'the table board should hold the three cells',
					timeout: 60_000,
				},
			)
			.toBe(3);

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
	});

	test('ends after its cycles: a stake and a board of its own, played to its end, settled, and the same winner in both browsers', async ({
		connectedPage,
		browser,
		authoriseBrowser,
	}) => {
		test.setTimeout(600_000);
		const host = connectedPage;

		// CREATE: two seats, two cycles, 4 gems a seat and no gap, so the board
		// is 8 cells a square of 3: x and y from -1 to 1 (L4-24)
		await openLobby(host);
		await host.getByTestId('table-seats-2').click();
		await host.getByTestId('table-cycles').fill('2');
		await host.getByTestId('table-option-stakeGems').fill('4');
		await host.getByTestId('table-option-gapPercent').fill('0');
		await host.getByTestId('table-create').click();
		await host.waitForURL(/[?&]game=0x[0-9a-fA-F]{40}/, {timeout: 90_000});
		const table = new URL(host.url()).searchParams.get('game');
		if (!table) throw new Error('the lobby did not open the table');
		await expect(host.getByTestId('table-lobby')).toBeVisible({
			timeout: 30_000,
		});
		await expect(host.getByTestId('table-lobby')).toContainText('4 gems');

		await getTestGems(host);
		await stake(host);
		await authoriseToPlay(host, authoriseBrowser);

		const guestContext = await browser.newContext({
			storageState: {cookies: [], origins: []},
		});
		const guest = await guestContext.newPage();
		try {
			await connectPageAs(guest, 0, `/play/?game=${table}`);
			await expect(guest.getByTestId('table-lobby')).toBeVisible();
			await getTestGems(guest);
			await stake(guest);
			await authoriseToPlay(guest, authoriseBrowser);
			await expect
				.poll(async () => (await rosterOf(host))?.members, {
					message: 'both should be seated',
					timeout: 60_000,
				})
				.toBe(2);
			// EACH SEAT STAKED EXACTLY THE TABLE'S AMOUNT (L4-23)
			for (const page of [host, guest]) {
				await expect
					.poll(async () => (await gameStep(page)).reserve, {
						message: "a seat holds exactly the table's stake",
						timeout: 60_000,
					})
					.toBe((4n * 10n ** 18n).toString());
			}
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
			// both pages on the cycle the start anchored, its full commit phase
			// ahead: a plan made on the clock read before the anchor is dropped
			// with that cycle
			const anchored = (await cycleOf(host)).cycleNumber;
			for (const page of [host, guest]) {
				await expect
					.poll(
						() =>
							page.evaluate(() => {
								const context = (globalThis as unknown as {context: any})
									.context;
								let value: any;
								const stop = context.game.cycleInfo.subscribe(
									(v: unknown) => (value = v),
								);
								stop();
								return value?.currentCycleNumber as number | undefined;
							}),
						{
							message: 'the page should read the anchored cycle',
							timeout: 30_000,
						},
					)
					.toBe(anchored);
			}
			await expect(host.getByTestId('table-progress')).toHaveText(
				'Cycle 1 of 2',
				{
					timeout: 30_000,
				},
			);

			// A CELL OUTSIDE THE SQUARE IS REFUSED by the planner, and said
			await host.bringToFront();
			await readyToPlay(host);
			await boardLoaded(host);
			await clickCell(host, {x: 2, y: 0});
			await expect
				.poll(
					() =>
						host.evaluate(() => {
							const context = (globalThis as unknown as {context: any}).context;
							let value: any;
							const stop = context.game.planning.selected.subscribe(
								(v: unknown) => (value = v),
							);
							stop();
							return value?.reason as string | undefined;
						}),
					{
						message: 'the planner should say the cell is off the board',
						timeout: 30_000,
					},
				)
				.toMatch(/outside this table's board/i);
			expect((await gameStep(host)).planned).toBe(0);

			// THE FIRST CYCLE: the guest's cell beside the host's
			await planAt(host, {x: 0, y: 0});
			await planAt(guest, {x: 1, y: 0});
			await commitNow(host);
			await commitNow(guest);
			for (const page of [host, guest]) {
				await expect
					.poll(async () => (await gameStep(page)).step, {
						message: 'each submission should reveal itself',
						timeout: 90_000,
					})
					.toBe('Revealed');
			}
			await expect(host.getByTestId('table-progress')).toHaveText(
				'Cycle 2 of 2',
				{
					timeout: 90_000,
				},
			);

			// THE LAST CYCLE
			await planAt(host, {x: -1, y: -1});
			await planAt(guest, {x: 1, y: 1});
			await commitNow(host);
			await commitNow(guest);
			for (const page of [host, guest]) {
				await expect
					.poll(async () => (await gameStep(page)).step, {
						message: 'each last turn should reveal itself',
						timeout: 90_000,
					})
					.toBe('Revealed');
			}
			await expect(host.getByTestId('table-progress')).toHaveText(
				'Ended after 2 cycles',
				{timeout: 90_000},
			);
			expect(await canPlay(host)).toBe(false);

			// SETTLED, by the host; the guest sees the same end
			await expect(host.getByTestId('table-settle')).toBeVisible({
				timeout: 60_000,
			});
			await host.getByTestId('table-settle').click();
			for (const page of [host, guest]) {
				await expect(page.getByTestId('table-end-status')).toContainText(
					/^Settled\./,
					{timeout: 90_000},
				);
			}
			const onChain = await host.evaluate(async () => {
				const context = (globalThis as unknown as {context: any}).context;
				const game = context.deployments.get().contracts.Stratagems;
				const read = (functionName: string) =>
					context.publicClient.readContract({
						address: game.address,
						abi: game.abi,
						functionName,
					});
				const [players, scores] = await read('getScores');
				const winners = await read('winners');
				return {
					scores: (players as bigint[]).map((p, i) => [
						`0x${p.toString(16).padStart(40, '0')}`,
						(scores as bigint[])[i].toString(),
					]),
					winners: (winners as bigint[]).map(
						(w) => `0x${w.toString(16).padStart(40, '0')}`,
					),
				};
			});
			expect(onChain.winners.length).toBeGreaterThan(0);
			const shown = (page: Page) =>
				page.evaluate(() => {
					const context = (globalThis as unknown as {context: any}).context;
					let value: any;
					const stop = context.game.leaderboard.subscribe(
						(v: unknown) => (value = v),
					);
					stop();
					return (value as any[])
						.map((row) => [row.player, String(row.score), Boolean(row.winner)])
						.sort();
				});
			const expected = onChain.scores
				.map(([player, score]) => [
					player,
					score,
					onChain.winners.includes(player),
				])
				.sort();
			await expect.poll(() => shown(host), {timeout: 30_000}).toEqual(expected);
			await expect
				.poll(() => shown(guest), {timeout: 30_000})
				.toEqual(expected);

			// L4-21: THE PROJECTION'S TIME, in this browser, on boards of 30 and
			// 300 coloured cells (a random board, the table's own simulation)
			await host.bringToFront();
			const timings = await host.evaluate(async () => {
				const context = (globalThis as unknown as {context: any}).context;
				const owners = [
					'0x00000000000000000000000000000000000a11ce',
					'0x0000000000000000000000000000000000000b0b',
					'0x00000000000000000000000000000000000ca201',
				];
				const id = (x: number, y: number) =>
					(
						(BigInt.asUintN(32, BigInt(y)) << 32n) +
						BigInt.asUintN(32, BigInt(x))
					).toString();
				// A BOARD THE RULES COULD HAVE MADE: pairs of enemies side by side
				// (each the other's one enemy, so both die and pay each other),
				// three columns apart so no pair touches another
				const boardOf = (n: number) => {
					const data = {
						cells: {} as Record<string, unknown>,
						owners: {} as Record<string, string>,
					};
					const cell = (enemyMap: number, color: number) => ({
						lastCycleUpdate: 100,
						cycleWhenTokenIsAdded: 100,
						producingCycles: 0,
						color,
						life: 2,
						delta: -1,
						enemyMap,
						distribution: 0,
						stake: 1,
					});
					for (let k = 0; k < n / 2; k++) {
						const x = (k % 15) * 3;
						const y = Math.floor(k / 15) * 2;
						data.cells[id(x, y)] = cell(8, 1);
						data.owners[id(x, y)] = owners[k % 3];
						data.cells[id(x + 1, y)] = cell(2, 2);
						data.owners[id(x + 1, y)] = owners[(k + 1) % 3];
					}
					return data;
				};
				const result: Record<string, number | string> = {};
				// the page's own longest gap with nothing projected, as a baseline
				{
					let longest = 0;
					let last = performance.now();
					const ticker = setInterval(() => {
						const now = performance.now();
						longest = Math.max(longest, now - last);
						last = now;
					}, 5);
					await new Promise((r) => setTimeout(r, 3000));
					clearInterval(ticker);
					result['idle-longest-gap'] = longest;
				}
				for (const n of [30, 60, 100, 300]) {
					const data = boardOf(n);
					// the longest the page's own thread went without running, while
					// the projection ran: what a player would feel as a dropped frame
					let longest = 0;
					let last = performance.now();
					const ticker = setInterval(() => {
						const now = performance.now();
						longest = Math.max(longest, now - last);
						last = now;
					}, 5);
					try {
						const started = performance.now();
						await context.game.tableEnd.project(data, 100);
						result[n] = performance.now() - started;
						result[`${n}-longest-gap`] = longest;
					} catch (error) {
						result[n] =
							`failed: ${String((error as Error).message).slice(0, 80)}`;
					} finally {
						clearInterval(ticker);
					}
				}
				return result;
			});
			console.log(
				`[table e2e] the projection in the browser (ms): ${JSON.stringify(timings)}`,
			);
			// L4-21 AS RESTATED (G1, the user, 2026-11-03): valued in the
			// background, so the page never blocks over 50 ms, and 300 cells
			// within one reveal phase (15 s here)
			expect(
				typeof timings[300],
				'L4-21: the projection on 300 cells completes',
			).toBe('number');
			expect(
				timings[300] as number,
				'L4-21: 300 cells valued within one reveal phase',
			).toBeLessThan(15_000);
			// the page already goes about 50 ms without running at idle (its
			// renderer and its board's worker, measured beside it), so what is
			// held is what the projection ADDS to the page's longest gap
			expect(
				(timings['300-longest-gap'] as number) -
					(timings['idle-longest-gap'] as number),
				"L4-21: what the projection adds to the page's longest gap",
			).toBeLessThan(25);

			// a member takes their gems out once settled
			const withdraw = host.getByTestId('table-withdraw');
			if (await withdraw.isVisible().catch(() => false)) {
				await withdraw.click();
				await expect
					.poll(async () => (await gameStep(host)).reserve, {timeout: 60_000})
					.toBe('0');
			}
		} finally {
			await guestContext.close();
		}
	});
});

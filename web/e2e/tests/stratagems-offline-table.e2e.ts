import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';

/**
 * A STRATAGEMS TABLE IN THE OFFLINE WORLD (step OT2 of
 * work/plans/join-template-commit-reveal.md, OT2-8): one person, one greedy
 * and one random world seat at a table of two cycles, with the default stake
 * and gap, played to its end with a reload inside it, and settled by the tab.
 *
 * What it holds: the lobby offers a table first; the tab creates it from the
 * person's account, seats everyone at it (each with exactly the table's
 * stake) and starts it, so the page opens on its first cycle with no table
 * lobby in between; the panel names the seats as the lobby did (You, The world
 * (Greedy), and the random seat The world); a cell outside
 * the table's square is refused by the planner and one inside it is played; a
 * reload restores the SAME table on the cycle it was in; after the last cycle
 * the table ends, and the tab settles it with nobody pressing anything: the
 * end names the winner and the leaderboard shows the scores the chain
 * recorded.
 *
 * The template's `offline-table.e2e.ts` plays the reference game's board and
 * is omitted here for ever (`.offshoot-omissions`), as `offline-ai.e2e.ts` is.
 *
 * IT CLAIMS NO ACCOUNT FROM THE SHARED POOL: every transaction is on a chain
 * inside this test's page, read through the WORLD's context
 * (`globalThis.offlineWorld`), whose records are the table's.
 */

const WORLD_UP = 'Everything below runs against a chain inside this tab';

const READ = `
	const read = (store) => {
		let value;
		const stop = store.subscribe((v) => (value = v));
		if (typeof stop === 'function') stop();
		return value;
	};
	const world = globalThis.offlineWorld;
	const context = world && world.context;
	const records = context && context.deployments.get();
	const call = (contract, functionName, args = []) =>
		context.publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName,
			args,
		});
`;

/** The table, from the chain: its address, cycle, end, settlement, and how many the factory made. */
async function tableOnChain(page: Page): Promise<
	| {
			address: string;
			cycleNumber: number;
			last: number;
			ended: boolean;
			settled: boolean;
			tables: number;
			reserves: string[];
	  }
	| undefined
> {
	return page.evaluate(`(async () => {
		${READ}
		if (!world) return undefined;
		const table = records.contracts.Stratagems;
		const cycle = await call(table, 'getCycle');
		const [, last, ended] = await call(table, 'getEnd');
		const [, members] = await call(table, 'getRoster');
		const reserves = [];
		for (const member of members) reserves.push(String(await call(table, 'getReserve', [member])));
		return {
			address: table.address,
			cycleNumber: Number(cycle.cycleNumber),
			last: Number(last),
			ended,
			settled: await call(table, 'isSettled'),
			tables: Number(await call(records.contracts.StratagemsTableFactory, 'numGames')),
			reserves,
		};
	})()`) as never;
}

/** How many moves the submission holds, and its step. */
async function submissionOf(
	page: Page,
): Promise<{step: string; planned: number} | undefined> {
	return page.evaluate(`(() => {
		${READ}
		if (!context) return undefined;
		const submission = read(context.game.submission);
		return {
			step: submission.step,
			planned: 'actions' in submission ? submission.actions.length : 0,
		};
	})()`) as never;
}

/** Why the planner refused the selected cell, if it did. */
async function refusal(page: Page): Promise<string | undefined> {
	return page.evaluate(`(() => {
		${READ}
		const selected = context && read(context.game.planning.selected);
		return selected ? selected.reason : undefined;
	})()`) as never;
}

/** Click the middle of the cell at x,y, through the world's own camera. */
async function clickCell(page: Page, cell: {x: number; y: number}) {
	const offset = (await page.evaluate(`(() => {
		const {transform} = globalThis.offlineWorld.context.render.cameraControl.current;
		return {
			x: (${cell.x} - transform.centerX) * transform.scale,
			y: (${cell.y} - transform.centerY) * transform.scale,
		};
	})()`)) as {x: number; y: number};
	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('the canvas has no layout box');
	await page.mouse.click(
		box.x + box.width / 2 + offset.x,
		box.y + box.height / 2 + offset.y,
	);
}

/**
 * PLAN ONE MOVE ON `cell`, clicking AT MOST ONCE PER SETTLED READ (the
 * fixtures' `planCell`, over the world's context): a click on a planned cell
 * unplans it, and under load the renderer handles a click after the next read.
 */
async function planCell(page: Page, cell: {x: number; y: number}) {
	const deadline = Date.now() + 60_000;
	const planned = async () => (await submissionOf(page))?.planned ?? 0;
	while ((await planned()) === 0) {
		if (Date.now() > deadline) break;
		await clickCell(page, cell);
		await expect
			.poll(planned, {timeout: 5_000})
			.toBe(1)
			.catch(() => undefined);
	}
	await expect.poll(planned, {message: 'one move should be planned'}).toBe(1);
	await page.waitForTimeout(500);
	expect(await planned(), 'the move should stay planned').toBe(1);
}

/** Plan one move inside the square, commit it, and wait for its reveal. */
async function playOneCell(page: Page, cell: {x: number; y: number}) {
	await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
	await planCell(page, cell);
	await page.getByRole('button', {name: /commit now/i}).click();
	await expect
		.poll(async () => (await submissionOf(page))?.step, {timeout: 90_000})
		.toBe('Revealed');
}

describe('A stratagems table in the offline world', () => {
	test('one person, a greedy and a random seat, two cycles to the end, a reload inside it, settled by the tab', async ({
		page,
	}) => {
		test.setTimeout(8 * 60_000);
		await page.goto('/offline/');

		await expect(page.getByText('How many at the table?')).toBeVisible({
			timeout: 60_000,
		});
		await page.getByTestId('mode-table').click();
		await page.getByTestId('seats-3').click();
		await page.getByTestId('table-cycles').fill('2');
		await page.getByTestId('level-0-greedy').click();
		await page.getByTestId('level-1-random').click();
		await page.getByTestId('sit-down').click();
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});

		// STARTED BY THE TAB: the panel, not the table's lobby, on cycle 1 of 2.
		const panel = page.getByTestId('table-panel');
		await expect(panel).toBeVisible({timeout: 60_000});
		await expect(page.getByTestId('table-lobby')).toHaveCount(0);
		const progress = panel.getByTestId('table-progress');
		await expect(progress).toHaveText('Cycle 1 of 2', {timeout: 30_000});
		const seats = panel.getByTestId('table-seats');
		await expect(seats).toContainText('You');
		await expect(seats).toContainText('The world (Greedy)');
		// a random seat is "The world", as the lobby names it (`random` is the
		// level a seat plays with none chosen)
		await expect(seats.getByText('The world', {exact: true})).toHaveCount(1);
		const opened = (await tableOnChain(page))!;
		expect(opened).toMatchObject({tables: 1, ended: false, settled: false});
		expect(opened.last).toBe(opened.cycleNumber + 1);
		// every seat holds exactly the table's stake: 10 gems at the defaults
		expect(opened.reserves).toEqual(Array(3).fill(String(10n * 10n ** 18n)));

		// THE SQUARE: three seats of 10 gems and a 50% gap, a side of 7 (-3..3).
		await expect
			.poll(async () => (await submissionOf(page))?.step, {timeout: 60_000})
			.toBeDefined();
		await clickCell(page, {x: 5, y: 0});
		await expect
			.poll(() => refusal(page), {
				message: 'the planner should say the cell is off the board',
				timeout: 30_000,
			})
			.toMatch(/outside this table's board/i);
		expect((await submissionOf(page))?.planned).toBe(0);

		// CYCLE ONE, inside the square.
		await playOneCell(page, {x: 3, y: 3});
		await expect(progress).toHaveText('Cycle 2 of 2', {timeout: 90_000});

		// A RELOAD INSIDE THE TABLE: the same table, on the cycle it was in.
		await page.reload();
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});
		await expect(progress).toHaveText('Cycle 2 of 2', {timeout: 60_000});
		expect(await tableOnChain(page)).toMatchObject({
			address: opened.address,
			tables: 1,
			cycleNumber: opened.last,
		});

		// THE LAST CYCLE, and the end.
		await playOneCell(page, {x: -3, y: 3});
		await expect(progress).toHaveText('Ended after 2 cycles', {
			timeout: 90_000,
		});

		// SETTLED BY THE TAB, with nobody pressing anything.
		await expect(page.getByTestId('table-end-status')).toContainText(
			/^Settled\. (The winner|A tie)/,
			{timeout: 90_000},
		);
		const settled = (await tableOnChain(page))!;
		expect(settled).toMatchObject({ended: true, settled: true, tables: 1});

		// THE SCORES THE CHAIN RECORDED, in the leaderboard, its winners marked.
		const onChain = (await page.evaluate(`(async () => {
			${READ}
			const table = records.contracts.Stratagems;
			const [players, scores] = await call(table, 'getScores');
			const winners = await call(table, 'winners');
			const hex = (p) => '0x' + p.toString(16).padStart(40, '0');
			return {
				scores: players.map((p, i) => [hex(p), String(scores[i])]),
				winners: winners.map(hex),
			};
		})()`)) as {scores: [string, string][]; winners: string[]};
		expect(onChain.scores).toHaveLength(3);
		expect(onChain.winners.length).toBeGreaterThan(0);
		const expected = onChain.scores
			.map(([player, score]) => [
				player,
				score,
				onChain.winners.includes(player),
			])
			.sort();
		await expect
			.poll(
				() =>
					page.evaluate(`(() => {
						${READ}
						return read(context.game.leaderboard)
							.map((row) => [row.player, String(row.score), Boolean(row.winner)])
							.sort();
					})()`),
				{timeout: 30_000},
			)
			.toEqual(expected);
		await page.getByTestId('leaderboard-toggle').click();
		await expect(page.getByTestId('leaderboard-score')).toHaveCount(3);
		await expect(page.getByTestId('leaderboard')).toContainText('(winner)');
	});
});

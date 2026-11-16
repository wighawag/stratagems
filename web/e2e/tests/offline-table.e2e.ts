import type {Page} from '@playwright/test';
import {
	test,
	expect,
	describe,
	expectTheReloadToResume,
} from '../fixtures/test';

/**
 * A TABLE IN THE OFFLINE WORLD (stratagems' plan, step OT1): one person, one
 * greedy and one random world seat at a table of two cycles, played to its end
 * with a reload inside it.
 *
 * What it holds: the lobby offers a table first; the world creates it from the
 * person's account, seats everyone at it and starts it, so the page opens on
 * its first cycle with no table lobby in between; the panel names the seats as
 * the lobby did; a reload restores the SAME table (the factory still holds one)
 * on the cycle it was in; and after the last cycle the table says it has
 * ended.
 *
 * Written against the byte-identical route and the chain read through
 * `globalThis.offlineWorld`, the context's records being the table's. A game
 * whose world offers no table skips it; a game that offers tables offline
 * plays them its own way, and omits this file as it omits `offline-ai.e2e.ts`.
 */

const WORLD_UP = 'Everything below runs against a chain inside this tab';

const READ = `
	const world = globalThis.offlineWorld;
	const records = world && world.context.deployments.get();
	const call = (contract, functionName, args = []) =>
		world.context.publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName,
			args,
		});
`;

/** Where the table is, from the chain: its cycle and its end. */
async function tableOnChain(page: Page): Promise<
	| {
			address: string;
			cycleNumber: number;
			commiting: boolean;
			last: number;
			ended: boolean;
			tables: number;
	  }
	| undefined
> {
	return page.evaluate(`(async () => {
		${READ}
		if (!world) return undefined;
		const game = records.contracts.Game;
		const cycle = await call(game, 'getCycle');
		const [, last, ended] = await call(game, 'getEnd');
		const tables = await call(records.contracts.GameFactory, 'numGames');
		return {
			address: game.address,
			cycleNumber: Number(cycle.cycleNumber),
			commiting: cycle.commiting,
			last: Number(last),
			ended,
			tables: Number(tables),
		};
	})()`) as never;
}

/** Click the board at an offset from its centre. */
async function clickCanvas(
	page: Page,
	offset: {x: number; y: number},
): Promise<void> {
	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('the canvas has no layout box');
	await page.mouse.click(
		box.x + box.width / 2 + offset.x,
		box.y + box.height / 2 + offset.y,
	);
}

/** Plan one placement, commit it, and wait for its reveal. */
async function playOneCell(
	page: Page,
	offset: {x: number; y: number},
): Promise<void> {
	await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
	await clickCanvas(page, offset);
	await page.getByRole('button', {name: /commit now/i}).click();
	await expect(
		page.getByText('Revealed. Your placements are on the board.'),
	).toBeVisible({timeout: 60_000});
}

describe('A table in the offline world', () => {
	test('one person, a greedy and a random seat, two cycles to the end, a reload inside it', async ({
		page,
	}) => {
		test.setTimeout(6 * 60_000);
		await page.goto('/offline/');

		await expect(page.getByText('How many at the table?')).toBeVisible({
			timeout: 60_000,
		});
		// A GAME WHOSE WORLD OFFERS NO TABLE (its `$lib/offline` exports no
		// `startOfflineTable`, or it has no tables) is not asked, and this file
		// arrives in it unchanged.
		test.skip(
			(await page.getByTestId('mode-table').count()) === 0,
			"this game's offline world offers no table",
		);
		await page.getByTestId('mode-table').click();
		await page.getByTestId('seats-3').click();
		await page.getByTestId('table-cycles').fill('2');
		test.skip(
			(await page.getByTestId('level-0-greedy').count()) === 0,
			"this game's offline world offers no levels",
		);
		await page.getByTestId('level-0-greedy').click();
		await page.getByTestId('level-1-random').click();
		await page.getByTestId('sit-down').click();
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});

		// STARTED BY THE TAB: the panel, not the table's lobby, on cycle 1 of 2.
		const panel = page.getByTestId('table-panel');
		await expect(panel).toBeVisible({timeout: 60_000});
		await expect(page.getByTestId('table-lobby')).toHaveCount(0);
		await expect(panel.getByTestId('table-progress')).toHaveText(
			'Cycle 1 of 2',
			{timeout: 30_000},
		);
		const seats = panel.getByTestId('table-seats');
		await expect(seats).toContainText('You');
		await expect(seats).toContainText('The world (Greedy)');
		await expect(seats.getByText('The world', {exact: true})).toHaveCount(1);
		const opened = await tableOnChain(page);
		expect(opened).toMatchObject({tables: 1, ended: false});
		expect(opened!.last).toBe(opened!.cycleNumber + 1);

		// CYCLE ONE.
		await playOneCell(page, {x: 40, y: 30});
		await expect(panel.getByTestId('table-progress')).toHaveText(
			'Cycle 2 of 2',
			{timeout: 60_000},
		);

		// A RELOAD INSIDE THE TABLE: the same table, on the cycle it was in.
		await expectTheReloadToResume(page);
		await page.reload();
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});
		await expect(panel.getByTestId('table-progress')).toHaveText(
			'Cycle 2 of 2',
			{timeout: 60_000},
		);
		const restored = await tableOnChain(page);
		expect(restored).toMatchObject({
			address: opened!.address,
			tables: 1,
			cycleNumber: opened!.last,
		});

		// THE LAST CYCLE, and the end.
		await playOneCell(page, {x: -60, y: -40});
		await expect(panel.getByTestId('table-progress')).toHaveAttribute(
			'data-ended',
			'true',
			{timeout: 60_000},
		);
		await expect(panel.getByTestId('table-progress')).toHaveText(
			'Ended after 2 cycles',
		);
		expect(await tableOnChain(page)).toMatchObject({ended: true, tables: 1});
	});
});

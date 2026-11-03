import type {Page} from '@playwright/test';
import {mnemonicToAccount} from 'viem/accounts';
import {test, expect, describe} from '../fixtures/test';

/**
 * HOTSEAT IN THE OFFLINE WORLD: two people at one device and one world seat,
 * two cycles, the device passed between them (stratagems' port plan, step H1).
 *
 * What it holds: the handover screen REPLACES the game between turns (no canvas
 * is mounted while the device changes hands); the second person is shown
 * nothing of the first person's plan (an empty submission, no planned cell,
 * the first person's cell not on the board before the reveal); both turns land
 * on the board when the cycle closes, revealed by the world's own revealer key
 * rather than by either person's; and a reload in the middle of a commit phase
 * lands on the handover for the right person, never on a plan, and the turn
 * committed before it is still revealed (the revealer forgot it; the handover
 * reveals it as that person, behind its screen).
 *
 * Written against the byte-identical route and world only, and the reference
 * game's board through `globalThis.offlineWorld`, so a game that plays hotseat
 * adapts the board reads and nothing else.
 */

const READ = `
	const read = (store) => {
		let value;
		const stop = store.subscribe((v) => (value = v));
		if (typeof stop === 'function') stop();
		else if (stop && typeof stop.unsubscribe === 'function') stop.unsubscribe();
		return value;
	};
	const world = globalThis.offlineWorld;
`;

/** The revealer's well-known key (`localRevealerKey`, index 2 + MOST_SEATS). */
const REVEALER = mnemonicToAccount(
	'test test test test test test test test test test test junk',
	{addressIndex: 12},
).address;

/**
 * Click the board at an offset from its centre. Here rather than imported from
 * the reference game's fixtures, which a game that replaces the reference game
 * does not have: this file arrives in every game unchanged.
 */
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

async function whoPlays(page: Page): Promise<string | undefined> {
	return page.evaluate(`(() => {
		${READ}
		if (!world) return undefined;
		const account = read(world.context.account);
		return account ? account.toLowerCase() : undefined;
	})()`) as Promise<string | undefined>;
}

async function planned(page: Page): Promise<{
	submission: string;
	actions: string[];
	plannedOnBoard: number;
}> {
	return page.evaluate(`(() => {
		${READ}
		const submission = read(world.context.game.submission);
		const view = read(world.context.viewState);
		const actions = 'actions' in submission
			? submission.actions.map((a) => a.cellID.toString())
			: [];
		const plannedOnBoard = view.step === 'Loaded'
			? [...view.cells.values()].filter((c) => c.planned).length
			: 0;
		return {submission: submission.step, actions, plannedOnBoard};
	})()`) as Promise<{
		submission: string;
		actions: string[];
		plannedOnBoard: number;
	}>;
}

async function claimants(page: Page, cellID: string): Promise<number> {
	return page.evaluate(`(() => {
		${READ}
		const view = read(world.context.viewState);
		if (view.step !== 'Loaded') return -1;
		const cell = view.cells.get(BigInt('${cellID}'));
		return cell ? cell.numClaimants : 0;
	})()`) as Promise<number>;
}

async function revealerSends(page: Page): Promise<number> {
	return page.evaluate(`(async () => {
		${READ}
		const nonce = await world.world.provider.request({
			method: 'eth_getTransactionCount',
			params: ['${REVEALER}', 'latest'],
		});
		return Number(BigInt(nonce));
	})()`) as Promise<number>;
}

/** Take the device as `label`, and wait for the game to be shown. */
async function begin(page: Page, label: string): Promise<void> {
	await expect(page.getByTestId('handover-to')).toHaveText(
		`Pass the device to ${label}`,
		{timeout: 120_000},
	);
	// Nothing of the game is mounted while the device changes hands.
	await expect(page.locator('canvas')).toHaveCount(0);
	await page.getByTestId('handover-begin').click();
	await expect(page.getByTestId('handover')).toHaveCount(0, {timeout: 60_000});
	await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
	// AND THE GAME IS SHOWN ONLY ONCE THIS PERSON'S DATA HAS LOADED: before it,
	// the submission drops every plan, so a click would be silently ignored.
	expect(await dataLoadedForWhoPlays(page)).toBe(true);
}

/** Whether the account data loaded is the signed-in person's own. */
async function dataLoadedForWhoPlays(page: Page): Promise<boolean> {
	return page.evaluate(`(() => {
		${READ}
		const lifecycle = read(world.context.accountData.lifecycle$);
		const account = read(world.context.account);
		return (
			lifecycle.status === 'ready' &&
			!!account &&
			lifecycle.account.toLowerCase() === account.toLowerCase()
		);
	})()`) as Promise<boolean>;
}

/** Plan one placement at `offset` and commit it; the cell planned. */
async function playOneCell(
	page: Page,
	offset: {x: number; y: number},
): Promise<string> {
	// A turn of a past cycle shown as `Revealed` is a state to plan from, like
	// `Idle`: whether a person comes back to it or to `Idle` depends on when
	// their record was restored against the chain, which differs by branch
	// (on `with/nft-identity` the identity is an avatar, resolved after the
	// account switch).
	await expect
		.poll(async () => (await planned(page)).submission, {timeout: 60_000})
		.toMatch(/Idle|Planning|Revealed/);
	await clickCanvas(page, offset);
	await expect
		.poll(async () => (await planned(page)).actions.length, {timeout: 15_000})
		.toBe(1);
	const [cell] = (await planned(page)).actions;
	await page.getByRole('button', {name: /commit now/i}).click();
	return cell;
}

describe('Hotseat in the offline world', () => {
	test('two people at one device and one world seat play two cycles, passing the device', async ({
		page,
	}) => {
		test.setTimeout(8 * 60_000);
		await page.goto('/offline/');

		await expect(page.getByText('How many at the table?')).toBeVisible({
			timeout: 60_000,
		});
		await page.getByTestId('seats-3').click();
		// A GAME WHOSE WORLD HAS NO HOTSEAT offers no choice of people (its
		// `$lib/offline` exports no `LOCAL_HUMANS_AT_MOST`), and this file arrives
		// in it unchanged: it says so rather than failing.
		test.skip(
			(await page.getByTestId('humans-2').count()) === 0,
			"this game's offline world offers no hotseat",
		);
		await page.getByTestId('humans-2').click();
		await expect(page.getByText('Player 2', {exact: true})).toBeVisible();
		await page.getByTestId('sit-down').click();

		// CYCLE ONE. Player 1 takes the device and commits a cell.
		await begin(page, 'Player 1');
		const first = await whoPlays(page);
		expect(first).toBeTruthy();
		const firstCell = await playOneCell(page, {x: 40, y: 30});

		// The device goes to Player 2, who is shown nothing of it.
		await begin(page, 'Player 2');
		await expect.poll(() => whoPlays(page), {timeout: 30_000}).not.toBe(first);
		const second = await whoPlays(page);
		const shown = await planned(page);
		expect(shown.actions).toEqual([]);
		expect(shown.plannedOnBoard).toBe(0);
		expect(await claimants(page, firstCell)).toBe(0);
		const secondCell = await playOneCell(page, {x: -60, y: -40});
		expect(secondCell).not.toBe(firstCell);

		// Everyone here has committed: covered until the cycle closes, then the
		// device goes back to Player 1, and both cells are on the board,
		// revealed by the revealer.
		await expect(page.getByTestId('handover-resolving')).toBeVisible({
			timeout: 60_000,
		});
		await begin(page, 'Player 1');
		await expect.poll(() => whoPlays(page), {timeout: 30_000}).toBe(first);
		await expect
			.poll(() => claimants(page, firstCell), {timeout: 30_000})
			.toBeGreaterThanOrEqual(1);
		await expect
			.poll(() => claimants(page, secondCell), {timeout: 30_000})
			.toBeGreaterThanOrEqual(1);
		expect(await revealerSends(page)).toBeGreaterThanOrEqual(2);
		const sentInCycleOne = await revealerSends(page);

		// CYCLE TWO, with a reload after Player 1 has committed: the page comes
		// back on the handover for Player 2, never on a plan.
		const thirdCell = await playOneCell(page, {x: 100, y: 60});
		await expect(page.getByTestId('handover-to')).toHaveText(
			'Pass the device to Player 2',
			{timeout: 60_000},
		);
		await page.reload();
		await begin(page, 'Player 2');
		await expect.poll(() => whoPlays(page), {timeout: 30_000}).toBe(second);
		expect((await planned(page)).actions).toEqual([]);
		const fourthCell = await playOneCell(page, {x: -120, y: 80});

		// The revealer lost Player 1's turn in the reload; it is revealed anyway,
		// and the cycle closes.
		await begin(page, 'Player 1');
		await expect
			.poll(() => claimants(page, thirdCell), {timeout: 30_000})
			.toBeGreaterThanOrEqual(1);
		await expect
			.poll(() => claimants(page, fourthCell), {timeout: 30_000})
			.toBeGreaterThanOrEqual(1);
		expect(await revealerSends(page)).toBeGreaterThan(sentInCycleOne);
	});
});

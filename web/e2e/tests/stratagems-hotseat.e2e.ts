import type {Page} from '@playwright/test';
import {mnemonicToAccount} from 'viem/accounts';
import {test, expect, describe} from '../fixtures/test';

/**
 * STRATAGEMS HOTSEAT IN THE OFFLINE WORLD, end to end (step H2 of
 * work/plans/join-template-commit-reveal.md): two people at one device and one
 * world seat, two cycles, the device passed between them.
 *
 * What it holds, as the template's `offline-hotseat.e2e.ts` does for the
 * reference game (omitted here, since it reads that game's board): the
 * handover screen REPLACES the game between turns (no canvas while the device
 * changes hands); the second person is shown nothing of the first person's
 * plan (an empty submission, no planned cell, none of the first person's cells
 * on the board before the reveal); both people's moves are on the board as the
 * world's indexer folded it, owned by each person's own account, when the cycle
 * closes, revealed by the world's revealer key rather than by either person's;
 * and a reload in a commit phase lands on the handover for the right person,
 * never on a plan, and the turn committed before it is still revealed (the
 * revealer forgot it; the handover reveals it as that person, behind its
 * screen).
 *
 * IT CLAIMS NO ACCOUNT FROM THE SHARED POOL: every transaction it causes is on
 * a chain that exists only inside this test's page.
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
 * Each person's two moves a cycle: outside the block the world's seats play
 * in, on screen, apart from each other's (so no fight between the two
 * people's cells decides what the board shows), and new each cycle.
 */
const CELLS = {
	first: [
		[
			{x: 9, y: 0},
			{x: 9, y: 3},
		],
		[
			{x: 10, y: 0},
			{x: 10, y: 3},
		],
	],
	second: [
		[
			{x: -9, y: 0},
			{x: -9, y: 3},
		],
		[
			{x: -10, y: 0},
			{x: -10, y: 3},
		],
	],
} as const;

type Cell = {x: number; y: number};

type Shown = {
	account?: string;
	cycleNumber?: number;
	viewLoaded: boolean;
	delegation: string;
	submission: string;
	planned: number;
	plannedOnBoard: number;
	board: {position: string; owner?: string}[];
};

async function shown(page: Page): Promise<Shown | undefined> {
	return (await page.evaluate(`(() => {
		${READ}
		if (!world) return undefined;
		const context = world.context;
		const submission = read(context.game.submission);
		const view = read(context.viewState);
		const account = read(context.account);
		const onchain = read(context.onchainState);
		const delegation = read(context.delegation);
		const cells = view && view.step === 'Loaded' ? [...view.cells.entries()] : [];
		return {
			account: account ? account.toLowerCase() : undefined,
			cycleNumber: onchain && onchain.step === 'Loaded' ? onchain.cycleNumber : undefined,
			viewLoaded: !!view && view.step === 'Loaded',
			delegation: delegation.step !== 'Loaded' ? delegation.step : delegation.allowed === true ? 'allowed' : 'refused',
			submission: submission.step,
			planned: 'actions' in submission ? submission.actions.length : 0,
			plannedOnBoard: cells.filter(([, cell]) => cell.planned !== undefined).length,
			board: cells
				.filter(([, cell]) => cell.owner)
				.map(([position, cell]) => ({position: String(position), owner: cell.owner.toLowerCase()})),
		};
	})()`)) as Shown | undefined;
}

/** A cell's packed position, as `stratagems-common`'s `xyToBigIntID`. */
function positionOf(cell: Cell): string {
	return (
		(BigInt.asUintN(32, BigInt(cell.y)) << 32n) +
		BigInt.asUintN(32, BigInt(cell.x))
	).toString();
}

/** How many of `cells` the indexed board says `owner` holds. */
async function owned(
	page: Page,
	cells: readonly Cell[],
	owner: string,
): Promise<number> {
	const board = (await shown(page))?.board ?? [];
	return cells.filter((cell) =>
		board.some((c) => c.position === positionOf(cell) && c.owner === owner),
	).length;
}

/** Click the middle of the cell at x,y, through the world's own camera. */
async function clickCell(page: Page, cell: Cell) {
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
}

/** Plan `cells` on the canvas and commit them. */
async function play(page: Page, cells: readonly Cell[]): Promise<void> {
	// A turn of a past cycle shown as `Revealed` is a state to plan from, like
	// `Idle` (the template's suite says why).
	await expect
		.poll(async () => (await shown(page))?.submission, {timeout: 60_000})
		.toMatch(/Idle|Planning|Revealed/);
	// Once this person's key is authorised and the board the moves are judged
	// against has loaded: a click before then is dropped (stratagems' offline
	// suite).
	await expect
		.poll(
			async () => {
				const now = await shown(page);
				return (
					now?.delegation === 'allowed' &&
					now.viewLoaded &&
					now.cycleNumber !== undefined
				);
			},
			{timeout: 60_000},
		)
		.toBe(true);
	for (const cell of cells) {
		await clickCell(page, cell);
		await page.waitForTimeout(200);
	}
	await expect
		.poll(async () => (await shown(page))?.planned, {timeout: 15_000})
		.toBe(cells.length);
	await page.getByRole('button', {name: /commit now/i}).click();
}

/** Nothing of anybody's plan is on screen, and `hidden` is not on the board. */
async function seesNoPlan(page: Page, hidden: readonly Cell[]): Promise<void> {
	await expect
		.poll(async () => (await shown(page))?.submission, {timeout: 60_000})
		.toMatch(/Idle|Planning|Revealed/);
	const now = (await shown(page))!;
	expect(now.planned).toBe(0);
	expect(now.plannedOnBoard).toBe(0);
	const board = now.board.map((c) => c.position);
	for (const cell of hidden) {
		expect(board, `${cell.x},${cell.y}`).not.toContain(positionOf(cell));
	}
}

describe('Stratagems hotseat', () => {
	test('two people at one device and one world seat play two cycles, passing the device', async ({
		page,
	}) => {
		test.setTimeout(10 * 60_000);
		await page.goto('/offline/');

		await expect(page.getByText('How many at the table?')).toBeVisible({
			timeout: 60_000,
		});
		await page.getByTestId('seats-3').click();
		await page.getByTestId('humans-2').click();
		await expect(page.getByText('Player 2', {exact: true})).toBeVisible();
		await page.getByTestId('sit-down').click();

		// CYCLE ONE. Player 1 takes the device and commits two moves.
		await begin(page, 'Player 1');
		await expect
			.poll(async () => (await shown(page))?.account, {timeout: 30_000})
			.toBeTruthy();
		const first = (await shown(page))!.account!;
		await play(page, CELLS.first[0]);

		// The device goes to Player 2, as their own account, shown nothing of it.
		await begin(page, 'Player 2');
		await expect
			.poll(async () => (await shown(page))?.account, {timeout: 30_000})
			.not.toBe(first);
		const second = (await shown(page))!.account!;
		expect(second).toBeTruthy();
		await seesNoPlan(page, CELLS.first[0]);
		await play(page, CELLS.second[0]);

		// Everyone here has committed: covered until the cycle closes, then the
		// device goes back to Player 1, and both people's moves are on the
		// indexed board, each owned by its own person, revealed by the revealer.
		await expect(page.getByTestId('handover-resolving')).toBeVisible({
			timeout: 60_000,
		});
		await begin(page, 'Player 1');
		await expect
			.poll(async () => (await shown(page))?.account, {timeout: 30_000})
			.toBe(first);
		await expect
			.poll(
				async () => ({
					first: await owned(page, CELLS.first[0], first),
					second: await owned(page, CELLS.second[0], second),
				}),
				{timeout: 60_000},
			)
			.toEqual({first: 2, second: 2});
		expect(await revealerSends(page)).toBeGreaterThanOrEqual(2);
		const sentInCycleOne = await revealerSends(page);

		// CYCLE TWO, with a reload after Player 1 has committed: the page comes
		// back on the handover for Player 2, never on a plan.
		await play(page, CELLS.first[1]);
		await expect(page.getByTestId('handover-to')).toHaveText(
			'Pass the device to Player 2',
			{timeout: 60_000},
		);
		await page.reload();
		await begin(page, 'Player 2');
		await expect
			.poll(async () => (await shown(page))?.account, {timeout: 30_000})
			.toBe(second);
		await seesNoPlan(page, CELLS.first[1]);
		await play(page, CELLS.second[1]);

		// The revealer lost Player 1's turn in the reload; it is revealed anyway,
		// behind the screen, and the cycle closes.
		await begin(page, 'Player 1');
		await expect
			.poll(
				async () => ({
					first: await owned(page, CELLS.first[1], first),
					second: await owned(page, CELLS.second[1], second),
				}),
				{timeout: 60_000},
			)
			.toEqual({first: 2, second: 2});
		expect(await revealerSends(page)).toBeGreaterThan(sentInCycleOne);
	});
});

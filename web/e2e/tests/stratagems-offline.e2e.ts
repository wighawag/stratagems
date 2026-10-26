import {test, expect, describe} from '../fixtures/test';
import type {Page} from '@playwright/test';

/**
 * STRATAGEMS OFFLINE, end to end (step O, P10, of
 * work/plans/join-template-commit-reveal.md): the lobby, a world of three seats
 * booted in the tab (a chain in a worker, stratagems' own deploy scripts run on
 * it, a generated wallet that signs in by itself), the human plans two moves on
 * the canvas and commits, the world's two seats commit, the manual cycle is
 * pushed on, everyone reveals, and the human's cells are on the board as the
 * world's own indexer folded them; then a reload restores the world, with the
 * same reserve and the same board, and "Get test gems" works in it.
 *
 * The template's `offline.e2e.ts` plays the reference game and is omitted;
 * this is stratagems' own, beside its cycle suite (`stratagems.e2e.ts`).
 *
 * IT CLAIMS NO ACCOUNT FROM THE SHARED POOL: every transaction it causes is on
 * a chain that exists only inside this test's page, from keys that world holds.
 *
 * Everything is read off the WORLD's context (`globalThis.offlineWorld`, which
 * `$lib/offline` installs), not off the app's console handle, which the app's
 * own context and the world's both write.
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

/** The human's two moves: outside the 13 by 13 block the seats play in, on screen. */
const HUMAN_CELLS = [
	{x: 9, y: 0},
	{x: 9, y: 3},
];

type WorldState = {
	account?: string;
	cycleNumber?: number;
	submission: string;
	planned: number;
	reserve?: string;
	walletGems?: string;
	delegation: string;
	board: {position: string; owner?: string; color: number}[];
};

async function worldState(page: Page): Promise<WorldState | undefined> {
	return (await page.evaluate(`(() => {
		${READ}
		if (!world) return undefined;
		const context = world.context;
		const submission = read(context.game.submission);
		const reserve = read(context.game.reserve);
		const onchain = read(context.onchainState);
		const view = read(context.viewState);
		const delegation = read(context.delegation);
		const cells = view && view.step === 'Loaded' ? [...view.cells.entries()] : [];
		return {
			account: read(context.account),
			cycleNumber: onchain && onchain.step === 'Loaded' ? onchain.cycleNumber : undefined,
			submission: submission.step,
			planned: 'actions' in submission ? submission.actions.length : 0,
			reserve: reserve.step === 'Loaded' ? reserve.amount.toString() : undefined,
			delegation: delegation.step !== 'Loaded' ? delegation.step : delegation.allowed === true ? 'allowed' : 'refused',
			board: cells
				.filter(([, cell]) => cell.owner)
				.map(([position, cell]) => ({position: String(position), owner: cell.owner, color: cell.color})),
		};
	})()`)) as WorldState | undefined;
}

/** A cell's packed position, as `stratagems-common`'s `xyToBigIntID`. */
function positionOf(cell: {x: number; y: number}): string {
	return (
		(BigInt.asUintN(32, BigInt(cell.y)) << 32n) +
		BigInt.asUintN(32, BigInt(cell.x))
	).toString();
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

async function enterTheWorld(page: Page) {
	await page.goto('/offline/');
	// A NEW WORLD asks how many sit at the table; a remembered one boots.
	const lobby = page.getByTestId('sit-down');
	const bar = page.getByText(
		'Everything below runs against a chain inside this tab',
	);
	await expect(lobby.or(bar)).toBeVisible({timeout: 120_000});
	if (await lobby.isVisible()) await lobby.click();
	await expect(bar).toBeVisible({timeout: 120_000});
}

describe('Stratagems offline', () => {
	test('boots a world of three, plays a cycle with its seats, and restores it on reload', async ({
		page,
	}) => {
		test.setTimeout(6 * 60_000);

		await enterTheWorld(page);
		await expect(page.getByText('3 seats at this table')).toBeVisible();
		// the world's chrome, not the app's: exactly one navbar, the world's
		await expect(page.locator('[data-app-navbar]')).toHaveCount(1);
		await expect(page.getByTestId('offline-world-navbar')).toBeVisible();
		await expect(page.getByTestId('wallet-status')).toHaveCount(0);

		// NO WALLET PROMPT AND NO GATE: the world signed in with its own wallet
		// and authorised this browser's key, and the chain says so.
		await expect
			.poll(async () => (await worldState(page))?.delegation, {
				timeout: 60_000,
			})
			.toBe('allowed');
		await expect(
			page.getByRole('button', {name: /authorise and carry on/i}),
		).toHaveCount(0);
		await expect(page.locator('[data-testid="acquire-stake"]')).toHaveCount(0);

		// A manual cycle starts at 2, stamped by the world's indexer.
		await expect(page.getByText('cycle 2')).toBeVisible({timeout: 60_000});
		const staked = (await worldState(page))!;
		expect(BigInt(staked.reserve ?? '0'), 'the world staked the human').toBe(
			32n * 10n ** 18n,
		);
		const account = staked.account!.toLowerCase();

		// TWO MOVES, planned on the canvas.
		await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
		for (const cell of HUMAN_CELLS) {
			await clickCell(page, cell);
			await page.waitForTimeout(200);
		}
		await expect
			.poll(async () => (await worldState(page))?.planned, {timeout: 15_000})
			.toBe(2);

		await page.getByRole('button', {name: /commit now/i}).click();

		// THE WHOLE CYCLE: the reveal happens only once the seats have committed
		// and the cycle was pushed into its reveal phase, and cycle 3 only once
		// everyone revealed and it was pushed again.
		await expect(page.getByText('cycle 3')).toBeVisible({timeout: 120_000});

		// THE BOARD, AS THE WORLD'S INDEXER FOLDED IT: the human's two cells, and
		// the seats' (each placed one; a played turn is a fixed function of the
		// cycle, so a collision would fail every run rather than flake).
		await expect
			.poll(
				async () => {
					const board = (await worldState(page))?.board ?? [];
					const mine = HUMAN_CELLS.filter((cell) =>
						board.some(
							(c) =>
								c.position === positionOf(cell) &&
								c.owner?.toLowerCase() === account,
						),
					).length;
					const theirs = board.filter(
						(c) => c.owner?.toLowerCase() !== account,
					).length;
					return {mine, theirs};
				},
				{timeout: 60_000},
			)
			.toEqual({mine: 2, theirs: 2});
		const before = (await worldState(page))!;

		// A RELOAD RESTORES THE WORLD: the same chain, no second stake, the same
		// board, folded by the index the world kept.
		await page.reload();
		await enterTheWorld(page);
		await expect(page.getByText('cycle 3')).toBeVisible({timeout: 60_000});
		await expect
			.poll(async () => (await worldState(page))?.reserve, {timeout: 60_000})
			.toBe(before.reserve);
		const restored = (await worldState(page))!;
		expect(restored.account?.toLowerCase()).toBe(account);
		await expect
			.poll(async () => (await worldState(page))?.board.length, {
				timeout: 60_000,
			})
			.toBe(before.board.length);

		// "GET TEST GEMS" WORKS IN THE WORLD: the distributor is deployed there,
		// and the world's wallet sends without asking.
		const gemsBefore = await page.evaluate(`(async () => {
			${READ}
			return String(await world.context.publicClient.readContract({
				address: world.context.deployments.get().contracts.TestTokens.address,
				abi: world.context.deployments.get().contracts.TestTokens.abi,
				functionName: 'balanceOf',
				args: ['${account}'],
			}));
		})()`);
		await page.getByTestId('get-test-gems').click();
		await expect
			.poll(
				async () =>
					BigInt(
						(await page.evaluate(`(async () => {
							${READ}
							return String(await world.context.publicClient.readContract({
								address: world.context.deployments.get().contracts.TestTokens.address,
								abi: world.context.deployments.get().contracts.TestTokens.abi,
								functionName: 'balanceOf',
								args: ['${account}'],
							}));
						})()`)) as string,
					) - BigInt(gemsBefore as string),
				{timeout: 60_000},
			)
			.toBe(15n * 10n ** 18n);
	});
});

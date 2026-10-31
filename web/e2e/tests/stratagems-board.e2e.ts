import type {Page, Route} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';
import {
	boardLoaded,
	cellPanel,
	clickCell,
	gameStep,
	getTestGems,
	positionOf,
	rivalCommits,
	stake,
} from '../fixtures/stratagems';

/**
 * STRATAGEMS' BOARD (step 9 of work/plans/join-template-commit-reveal.md):
 *
 * - P9-10: the board is the pixi host on a WebGL canvas, not the canvas-2d
 *   stopgap it replaced, and it mounts without a page error.
 * - P9-8: a click before the indexed board has loaded is refused with a word
 *   (the cell panel says the board is still loading) rather than dropped, the
 *   board says it is loading over its wood, and once the board loads both go.
 *
 * - X2 (PX9): what a planned move does is drawn from the contract's own code
 *   (`StratagemsSimulation`, run in the bytecode sandbox): a rival's lone cell
 *   grows, and a move planned beside it in another colour turns it to shrink,
 *   before anything is committed; and how long the preview of a full turn takes.
 *
 * The later tests stake (a click means nothing until the player could commit
 * it), so this file has an account of its own. None of them commits.
 */
describe('Stratagems board', () => {
	test.use({walletAccountIndex: 5});

	test('is drawn by the pixi host on a WebGL canvas', async ({
		connectedPage,
	}) => {
		const page = connectedPage;
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		await boardLoaded(page);

		const context = await page.evaluate(() => {
			const canvas = document.querySelector('canvas');
			if (!canvas) return 'no canvas';
			// a canvas keeps the one context type it was first asked for, so
			// asking for WebGL returns pixi's context, or null for a 2D canvas
			if (canvas.getContext('webgl2')) return 'webgl2';
			if (canvas.getContext('webgl')) return 'webgl';
			return 'not webgl';
		});
		expect(context, 'the board should be the pixi host on WebGL').toMatch(
			/^webgl2?$/,
		);
		expect(errors, 'no page error while the board mounts').toEqual([]);
	});

	test('refuses a click before the board has loaded, saying so, and plays once it has', async ({
		browser,
		connectWallet,
	}) => {
		// A context of its own, with NO service worker: a page the app's service
		// worker controls sends its requests through it, and Playwright's routes
		// do not see a request the worker handles, so nothing could be held.
		const context = await browser.newContext({
			storageState: {cookies: [], origins: []},
			serviceWorkers: 'block',
		});
		try {
			const page = await context.newPage();
			await page.goto('/play');
			await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
			const connect = page.getByRole('button', {name: /^connect$/i}).first();
			await expect(connect).toBeEnabled({timeout: 60_000});
			await connect.click();
			await connectWallet(page);
			await getTestGems(page);
			await stake(page);
			await readyToPlay(page);
			await boardLoaded(page);

			// Hold the indexer's log requests, then reload: the board stays
			// unloaded while the rest of the app (the wallet, the cycle) comes up.
			const gate = holdLogs(page);
			await page.reload();
			await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
			await expect
				.poll(() => gate.held(), {
					message: 'the indexer asked for logs',
					timeout: 30_000,
				})
				.toBeGreaterThan(0);
			await expect(
				page.getByTestId('board-loading'),
				'the board says it is loading, over its wood',
			).toBeVisible();
			await readyToPlay(page);

			await expect
				.poll(
					async () => {
						await clickCell(page, {x: 3, y: -4});
						return (await cellPanel(page).textContent()) ?? '';
					},
					{
						message: 'a click before the board loads is refused, with a word',
						timeout: 30_000,
					},
				)
				.toContain('The board is still loading');

			await gate.release();
			await boardLoaded(page);
			await expect(page.getByTestId('board-loading')).toBeHidden({
				timeout: 30_000,
			});
		} finally {
			await context.close();
		}
	});
});

/**
 * Its own account, and serial: both stake it, and neither commits, so a plan
 * left by one cannot reach the chain.
 */
describe('Stratagems board: the preview', () => {
	test.use({walletAccountIndex: 6});
	test.describe.configure({mode: 'serial'});

	test('draws what a planned move does, from the contract’s own code', async ({
		connectedPage,
	}) => {
		const page = connectedPage;
		await getTestGems(page);
		await stake(page);
		await readyToPlay(page);
		await boardLoaded(page);

		// the player's faction, and a rival colour that is its enemy
		const faction = (await page.evaluate(`(() => {
			let value;
			globalThis.context.game.faction.subscribe((v) => (value = v))();
			return value;
		})()`)) as number;
		const rivalColor = (faction % 5) + 1;
		const RIVAL = {x: 8, y: -6};
		const BESIDE = {x: 9, y: -6};

		// A RIVAL places a lone cell, through a whole cycle
		await phase(page, 'play', 10);
		const rival = await rivalCommits(page, {...RIVAL, color: rivalColor});
		await phase(page, 'reveal', 0);
		await rival.reveal();
		await expect
			.poll(async () => (await cellView(page, RIVAL))?.color, {
				message: "the rival's cell is on the board",
				timeout: 90_000,
			})
			.toBe(rivalColor);
		expect(await cellView(page, RIVAL)).toMatchObject({
			trend: 'grow',
			enemies: 0,
		});

		// planned beside it in an enemy colour: the rival's cell will shrink
		await phase(page, 'play', 15);
		await clickCell(page, BESIDE);
		await expect
			.poll(async () => (await cellView(page, BESIDE))?.planned, {
				message: 'the move is planned',
				timeout: 15_000,
			})
			.toBe(faction);
		await expect
			.poll(async () => await cellView(page, RIVAL), {
				message: "the contract's code says the rival's cell will shrink",
				timeout: 30_000,
			})
			.toMatchObject({trend: 'shrink', enemies: 1});
		expect(await cellView(page, BESIDE)).toMatchObject({
			color: faction,
			enemies: 1,
		});

		// taken back: the rival's cell grows again, and nothing is committed
		await clickCell(page, BESIDE);
		await expect
			.poll(async () => (await cellView(page, RIVAL))?.trend, {
				message: 'without the move the cell grows again',
				timeout: 15_000,
			})
			.toBe('grow');
		expect((await gameStep(page)).planned).toBe(0);
	});

	test('previews a full turn in good time (measured)', async ({
		connectedPage,
	}) => {
		const page = connectedPage;
		await getTestGems(page);
		await stake(page);
		await readyToPlay(page);
		await boardLoaded(page);
		await phase(page, 'play', 20);

		// a full turn (the client's cap, 30 moves) on empty cells away from the
		// rest, twice: the first pays for the sandbox's start, the second does not
		const timings: number[] = [];
		for (const row of [40, 42]) {
			const positions = Array.from({length: 30}, (_, i) =>
				positionOf({x: 40 + 2 * i, y: row}).toString(),
			);
			const elapsed = (await page.evaluate(`(async () => {
				const positions = ${JSON.stringify(positions)};
				const game = globalThis.context.game;
				const read = (store) => { let v; store.subscribe((x) => (v = x))(); return v; };
				game.planning.clear();
				const start = performance.now();
				for (const p of positions) game.planning.click(BigInt(p));
				for (;;) {
					const view = read(globalThis.context.viewState);
					const done = view.step === 'Loaded' && positions.every((p) => {
						const cell = view.cells.get(p);
						return cell && cell.planned !== undefined && cell.color === cell.planned;
					});
					if (done) break;
					if (performance.now() - start > 60000) return -1;
					await new Promise((r) => setTimeout(r, 5));
				}
				const elapsed = performance.now() - start;
				game.planning.clear();
				return elapsed;
			})()`)) as number;
			expect(elapsed, 'the preview of a full turn lands').toBeGreaterThan(0);
			timings.push(elapsed);
		}
		console.log(
			`preview of 30 moves: ${timings.map((t) => `${Math.round(t)} ms`).join(', then ')}`,
		);
		expect((await gameStep(page)).planned).toBe(0);
	});
});

/** Wait for `phase` ('play' or 'reveal') with at least `secondsLeft` of it left. */
async function phase(
	page: Page,
	name: string,
	secondsLeft: number,
): Promise<void> {
	await expect
		.poll(
			async () => {
				const step = await gameStep(page);
				return step.phase === name && step.timeLeft > secondsLeft;
			},
			{message: `a ${name} phase with ${secondsLeft}s left`, timeout: 120_000},
		)
		.toBe(true);
}

/** A cell as the board draws it, with its trend, or undefined. */
async function cellView(
	page: Page,
	cell: {x: number; y: number},
): Promise<
	{color: number; trend: string; enemies: number; planned?: number} | undefined
> {
	return page.evaluate(`(() => {
		let view;
		globalThis.context.viewState.subscribe((v) => (view = v))();
		if (!view || view.step !== 'Loaded') return undefined;
		const cell = view.cells.get('${positionOf(cell)}');
		return cell ? {color: cell.color, trend: cell.trend, enemies: cell.enemies, planned: cell.planned} : undefined;
	})()`) as Promise<
		| {color: number; trend: string; enemies: number; planned?: number}
		| undefined
	>;
}

/** Wait until a click on the board means something (setup done, the phase right). */
async function readyToPlay(page: Page): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const context = (
						globalThis as {
							context?: {
								game: {
									readyToPlay: {subscribe(f: (v: boolean) => void): () => void};
								};
							};
						}
					).context;
					if (!context) return false;
					let ready = false;
					context.game.readyToPlay.subscribe((value) => (ready = value))();
					return ready;
				}),
			{message: 'the player can plan', timeout: 120_000},
		)
		.toBe(true);
}

/** Hold every JSON-RPC `eth_getLogs` the page sends until released. */
function holdLogs(page: Page): {held(): number; release(): Promise<void>} {
	let open: () => void = () => {};
	const released = new Promise<void>((resolve) => (open = resolve));
	let held = 0;
	const handler = async (route: Route) => {
		const body = route.request().postData() ?? '';
		if (!body.includes('eth_getLogs')) return route.fallback();
		held++;
		await released;
		return route.fallback();
	};
	void page.route('**/*', handler);
	return {
		held: () => held,
		release: async () => {
			open();
			await page.unroute('**/*', handler);
		},
	};
}

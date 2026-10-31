import type {Page, Route} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';
import {
	boardLoaded,
	cellPanel,
	clickCell,
	getTestGems,
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
 * The second stakes (a click means nothing until the player could commit it),
 * so this file has an account of its own.
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

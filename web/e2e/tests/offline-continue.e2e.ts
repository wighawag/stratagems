import type {Page} from '@playwright/test';
import {
	test,
	expect,
	describe,
	chooseTheWorld,
	continueTheSavedGame,
	expectTheReloadToResume,
} from '../fixtures/test';

/**
 * A FRESH VISIT TO A BROWSER THAT HOLDS A WORLD IS ASKED, A RELOAD IS NOT.
 *
 * A player who had played before opened offline mode, found themselves in an
 * old world, and concluded offline had no configuration. So `/offline/` with a
 * saved world offers continuing it or a new one, and `/offline/?continue` (what
 * the route rewrites its URL to once a table is settled) resumes it. The rule is
 * `$lib/game/lobby/arrival`'s, and its cases are unit tests; this is the screen.
 *
 * WRITTEN AGAINST THE BYTE-IDENTICAL SURFACE ONLY (the lobby's presses, the
 * world's bar and navbar), so every game runs it unchanged. The proof that
 * Continue restores the SAME world is the chain id the navbar names.
 *
 * IT CLAIMS NO WALLET ACCOUNT FROM THE SHARED POOL: every transaction is on a
 * chain inside the page.
 */

const WORLD_UP = 'Everything below runs against a chain inside this tab';

async function chainIdOf(page: Page): Promise<string> {
	const id = page.getByTestId('offline-world-navbar').locator('code');
	await expect(id).toBeVisible();
	return (await id.textContent())?.trim() ?? '';
}

describe('Arriving at a saved offline world', () => {
	test('offers continuing it or a new one; Continue restores it, New game asks then shows the setup', async ({
		page,
	}) => {
		// A WORLD SAVED IN THIS BROWSER, by the ordinary setup.
		await page.goto('/offline/');
		await expect(page.getByTestId('sit-down')).toBeVisible({timeout: 60_000});
		await chooseTheWorld(page);
		await page.getByTestId('sit-down').click();
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});
		const world = await chainIdOf(page);
		expect(world).toMatch(/^\d+$/);
		await expectTheReloadToResume(page);

		// A FRESH VISIT: the choice, describing the world, and nothing booted.
		await page.goto('/offline/');
		await expect(page.getByTestId('continue-saved-game')).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.getByTestId('saved-game')).toHaveText(
			'The world, with 3 seats.',
		);
		await expect(page.getByTestId('sit-down')).toHaveCount(0);
		await expect(page.getByText(WORLD_UP)).toHaveCount(0);

		// CONTINUE: the same world, and a URL whose reload resumes it.
		await continueTheSavedGame(page);
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});
		expect(await chainIdOf(page)).toBe(world);
		await expectTheReloadToResume(page);

		// A NEW GAME, after a fresh visit: asked first, and keeping it changes
		// nothing; throwing it away shows the setup, in place.
		await page.goto('/offline/');
		await expect(page.getByTestId('new-game')).toBeVisible({timeout: 60_000});
		await page.getByTestId('new-game').click();
		await expect(page.getByTestId('confirm-new-game')).toBeVisible();
		await page.getByTestId('keep-saved-game').click();
		await expect(page.getByTestId('continue-saved-game')).toBeVisible();
		await page.getByTestId('new-game').click();
		await page.getByTestId('discard-saved-game').click();
		await expect(page.getByTestId('sit-down')).toBeVisible({timeout: 60_000});
		await expect(page.getByTestId('continue-saved-game')).toHaveCount(0);

		// AND THE NEW WORLD IS A NEW ONE: a different chain id.
		await chooseTheWorld(page);
		await page.getByTestId('sit-down').click();
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});
		expect(await chainIdOf(page)).not.toBe(world);
		await expectTheReloadToResume(page);
	});
});

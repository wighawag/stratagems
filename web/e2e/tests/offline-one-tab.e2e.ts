import {test, expect, describe} from '../fixtures/test';
import type {Page} from '@playwright/test';

/**
 * ONE TAB PER OFFLINE WORLD, in a real browser: two pages of one context share
 * an origin's Web Locks and its `BroadcastChannel`, the way two tabs do.
 *
 * WRITTEN AGAINST THE BYTE-IDENTICAL SURFACE ONLY, which is what lets every game
 * run it unchanged: the lobby's "sit down" press, the world's own bar and navbar,
 * and the refusal `routes/offline` renders. Nothing here knows what a game's
 * board looks like, so the proof that the second tab plays the SAME world is the
 * chain id the navbar names, which is what keys everything the world keeps.
 *
 * Two worlds in one browser would each restore the same chain and then mine and
 * save their own blocks over each other's, and nothing on screen would look
 * wrong until a reload. So the assertions are the refusal itself, and that taking
 * over moves the world rather than copying it: the first tab is refused once it
 * has let go.
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

describe('One tab per offline world', () => {
	test('refuses a second tab, and taking over moves the world to it', async ({
		page,
	}) => {
		await page.goto('/offline/');
		await expect(page.getByTestId('sit-down')).toBeVisible({timeout: 60_000});
		await page.getByTestId('sit-down').click();
		await expect(page.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});
		const world = await chainIdOf(page);
		expect(world).toMatch(/^\d+$/);

		// THE SECOND TAB IS REFUSED, and offered neither the world nor a new one:
		// the chooser would let it write a seat count over a world it cannot play.
		const second = await page.context().newPage();
		await second.goto('/offline/');
		await expect(second.getByTestId('world-in-another-tab')).toBeVisible({
			timeout: 60_000,
		});
		await expect(second.getByTestId('sit-down')).toHaveCount(0);
		await expect(second.getByText(WORLD_UP)).toHaveCount(0);
		// The first tab never heard a thing.
		await expect(page.getByText(WORLD_UP)).toBeVisible();

		// TAKING OVER: the first tab lets go and reloads into the refusal, and the
		// second boots the same world by the ordinary restore.
		await second.getByTestId('take-the-world-over').click();
		await expect(second.getByText(WORLD_UP)).toBeVisible({timeout: 120_000});
		expect(await chainIdOf(second)).toBe(world);
		await expect(page.getByTestId('world-in-another-tab')).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.getByText(WORLD_UP)).toHaveCount(0);

		await second.close();
	});
});

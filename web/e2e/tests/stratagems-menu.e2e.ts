import {test, expect, describe} from '../fixtures/test';

/**
 * STRATAGEMS' GAME MENU OFFERS ITS TABLES. The menu (`routes/+page.svelte`) is
 * the stem's file, and it shows "Tables" when the game exports a `lobby`,
 * which stratagems does. For two weeks it did not show it here: a cascade
 * merge had kept an older copy of the menu, from before the entry existed, and
 * every suite passed, because the stem's `home.e2e.ts` asks only for "Online"
 * and "Offline" (a game may have no tables). Step C2 of
 * work/plans/join-template-commit-reveal.md took the stem's copy back; this is
 * what says a game with tables offers them.
 */
describe('The game menu', () => {
	test('offers the tables, leading to the lobby', async ({page}) => {
		await page.goto('/');

		const nav = page.getByRole('navigation', {name: 'Game menu'});
		const tables = nav.getByRole('link', {name: /^tables$/i});
		await expect(tables).toBeVisible();
		await expect(tables).toHaveAttribute('href', /\/lobby\/?(\?.*)?$/);

		await tables.click();
		await expect(page).toHaveURL(/\/lobby\/?(\?.*)?$/);
	});
});

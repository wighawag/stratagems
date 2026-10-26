import {readFileSync} from 'node:fs';
import {test, expect, describe} from '../fixtures/test';

/**
 * THE APP'S NAME COMES FROM THE APP, not from a literal here.
 *
 * `routes/+page.svelte` titles itself from `src/web-config.json`: the `logo`
 * image with `name` as its `alt` when the config has one, `name` as text when
 * it does not, and the heading carries `name` either way. So that file is the
 * single fact and this suite reads the same one. Spelling "Jolly Roger" out
 * instead made these tests assert the TEMPLATE's identity rather than the
 * app's, which is invisible for as long as a descendant keeps the inherited
 * name and breaks the moment one does the first thing anybody does with a
 * template: rename it. `reveal-or-die` renamed itself and inherited two
 * failures that had nothing to do with its home page, which rendered perfectly.
 *
 * READ, NOT IMPORTED. `import ... from './x.json'` type-checks (TypeScript has
 * `resolveJsonModule`) and then throws at run time under Playwright's ESM
 * loader, which wants an `import ... with {type: 'json'}` attribute. Reading the
 * file is what `playwright.config.ts` already does for
 * `e2e/impersonate-addresses.json`, so this is the established way to reach a
 * JSON fact from the suite rather than a second one.
 */
const WEB_CONFIG: {name: string; logo?: string} = JSON.parse(
	readFileSync(new URL('../../src/web-config.json', import.meta.url), 'utf8'),
);
const APP_NAME = WEB_CONFIG.name;

describe('Home Page', () => {
	test('should be titled with the app name', async ({page}) => {
		await page.goto('/');

		// A heading named by the app's own name, whether it holds the logo (whose
		// `alt` names it) or the name as text: which one is the config's choice,
		// and the page is the same file in every game.
		const title = page.getByRole('heading', {name: APP_NAME, exact: true});
		await expect(title).toBeVisible();

		// And when there is a logo, it is the image that says it, not stray text.
		if (WEB_CONFIG.logo) {
			await expect(title.getByRole('img', {name: APP_NAME})).toBeVisible();
		}
	});

	test('should offer the game online and offline', async ({page}) => {
		await page.goto('/');

		const online = page.getByRole('link', {name: /^online$/i});
		await expect(online).toBeVisible();
		await expect(online).toHaveAttribute('href', /\/play\/?(\?.*)?$/);

		const offline = page.getByRole('link', {name: /^offline$/i});
		await expect(offline).toBeVisible();
		await expect(offline).toHaveAttribute('href', /\/offline\/?(\?.*)?$/);
	});
});

describe('Home Page - Navigation', () => {
	test('should navigate to the game and back', async ({page}) => {
		await page.goto('/');

		const playLink = page.getByRole('link', {name: /^online$/i});
		await expect(playLink).toBeVisible({timeout: 10000});

		// Go to the game. A click during SvelteKit hydration can be swallowed (the
		// router installs its handler mid-flight), so retry until the URL changes.
		await expect(async () => {
			await playLink.click();
			await page.waitForURL(/play/, {timeout: 3000});
		}).toPass({timeout: 15000});

		// The canvas is the game: it only mounts in the browser, so its presence
		// also says hydration got as far as running the page's own code.
		await expect(page.locator('canvas')).toBeVisible({timeout: 15000});

		// Navigate directly back to home using goto
		await page.goto('/');
		await page.waitForLoadState('load', {timeout: 15000});

		// Verify we're back on the home page by checking for its heading, which is
		// the app's own name (see the note at the top of this file).
		await expect(
			page.getByRole('heading', {name: APP_NAME, exact: true}),
		).toBeVisible({timeout: 10000});
	});
});

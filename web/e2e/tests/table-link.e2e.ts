import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';

/**
 * AN INVITE LINK TO SOMETHING THAT IS NOT A TABLE is refused before its page
 * is composed (`$lib/context/table-gate.ts`): no wallet step, no stake, no
 * seat, only what is wrong and the way to the tables. A stake at a table
 * approves the table's contract, so a link a stranger made must not be able
 * to point that approval at anything but a clone of this game's own
 * implementation.
 *
 * Written against the layout's gate and the root page only, so it is the same
 * file in every game of the tree and runs there unchanged.
 */

/** Some contract of this deployment: real code, and not a table. */
async function aContractThatIsNotATable(page: Page): Promise<`0x${string}`> {
	await page.goto('/');
	await page.waitForFunction(
		() => (globalThis as unknown as {context?: unknown}).context !== undefined,
	);
	return page.evaluate(() => {
		const context = (globalThis as unknown as {context: any}).context;
		const contracts = Object.values(context.deployments.get().contracts) as {
			address: `0x${string}`;
		}[];
		return contracts[0].address;
	});
}

async function expectRefused(page: Page, reason: RegExp) {
	const gate = page.getByTestId('table-gate');
	await expect(gate).toHaveAttribute('data-step', 'NotATable', {
		timeout: 30_000,
	});
	await expect(gate.getByText('This is not a table')).toBeVisible();
	await expect(gate.getByText(reason)).toBeVisible();
	await expect(gate.getByRole('link', {name: 'See the tables'})).toBeVisible();
	// Nothing of the app was composed: no context, so no control to act with.
	expect(
		await page.evaluate(
			() => (globalThis as unknown as {context?: unknown}).context,
		),
	).toBeUndefined();
	await expect(
		page.getByRole('button', {name: /stake|seat|connect/i}),
	).toHaveCount(0);
}

describe('an invite link that is not a table', () => {
	test('is refused when nothing is at its address', async ({page}) => {
		await page.goto('/?game=0x000000000000000000000000000000000000dEaD');
		await expectRefused(page, /There is no contract at this address/);
	});

	test("is refused when its contract is not one of this game's tables", async ({
		page,
	}) => {
		const address = await aContractThatIsNotATable(page);
		await page.goto(`/?game=${address}`);
		await expectRefused(page, /not one of this game's tables/);
	});
});

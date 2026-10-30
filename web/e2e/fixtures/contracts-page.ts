import {expect, type Page} from '@playwright/test';

/**
 * The contracts page, as a place two kinds of suite have to drive.
 *
 * SEPARATE FROM `stalling-wallet.ts`, and the separation is load-bearing rather
 * than tidiness. `test/e2e-account-claims.test.ts` reads "imports
 * fixtures/stalling-wallet" as "drives the stalling wallet, and therefore claims
 * one of its accounts", which is exactly the right heuristic: that pool exists
 * so two suites cannot race for one address's nonce. While these locators lived
 * in that file, any suite that wanted a form locator had to import it and was
 * counted as claiming stalling account 0 alongside the suite that really drives
 * it. The guard then fires, correctly, on a claim nobody made.
 *
 * So what is shared here is the PAGE: which contract, which write, which form,
 * which button. Who is asked to sign it is the caller's business.
 *
 * MOVED UP FROM reveal-or-die (2026-09-11), where it was written after this
 * page's sort-order assumption broke four inherited tests there. Decision 2's
 * test - *would another game on this foundation have to write this?* - was
 * answered "yes" by an existing second copy, and this is the move rather than a
 * re-implementation: the descendant's copy is deleted in the same change.
 */

/**
 * The write this fixture drives, named once.
 *
 * `addToReserve`, this app's own. The suites import it rather than restating it,
 * because a suite that asserts on a form has to be looking at the form that was
 * actually filled.
 *
 * THIS IS THE ONE LINE A DESCENDANT CHANGES, and it is the only game-specific
 * thing in this file - the `mode.ts`/`TARGET_STEP` shape applied to a fixture.
 * Everything else here is about the PAGE, which every app on this template
 * ships unchanged.
 */
export const WRITE_FUNCTION = 'addToReserve nonpayable';

/** The contract the writes live on, which is NOT always the one the page opens on. */
export const WRITE_CONTRACT = 'Stratagems';

/** What the trigger says before `$deployments` has loaded. */
const PLACEHOLDER = 'Select a contract';

/**
 * Put the contracts page on a named contract.
 *
 * THE PAGE OPENS ON WHICHEVER CONTRACT SORTS FIRST, because it shows
 * `Object.keys($deployments.contracts)[0]`. That is `Game` on this template
 * today and it is not a property anything guarantees: a branch that added a sale
 * called `AvatarSale` moved the page off the Game and failed four tests in
 * `contracts.e2e.ts` that never name a contract at all. None of the failures
 * named the cause either - the page was showing a different contract's functions
 * perfectly correctly.
 *
 * So a suite that means "the Game" asks for it. Calling this when the page is
 * already there costs one comparison and no round trip.
 */
export async function selectContract(
	page: Page,
	name: string = WRITE_CONTRACT,
): Promise<void> {
	// BY `data-slot`, NOT BY ROLE. bits-ui renders the trigger as a plain
	// `button` whose accessible name is the selected contract, so
	// `getByRole('combobox')` matches nothing here.
	const trigger = page.locator('[data-slot="select-trigger"]');
	await expect(trigger).toBeVisible({timeout: 30_000});
	// WAIT FOR THE CONTRACTS TO LOAD before reading which one is showing. Until
	// `$deployments` arrives the trigger says "Select a contract" and the dropdown
	// has NO items - so an early click opens an empty list and waits out its whole
	// timeout on an item that was never going to be there. That is what this looked
	// like when it was first moved up here: four tests failing at the click, on a
	// page that was about to be perfectly fine.
	await expect(trigger).not.toHaveText(PLACEHOLDER, {timeout: 30_000});
	const selected = () => trigger.textContent().then((t) => (t ?? '').trim());
	// Already there: the page opens on one of them, and re-picking it is a no-op
	// that still costs a dropdown round trip.
	if ((await selected()) === name) return;

	await trigger.click();
	// EXACTLY, because the list is `Object.keys(deployments.contracts)` and a
	// routed proxy publishes a dozen of them: `Game`, but also `Game_Proxy`,
	// `Game_Implementation` and one entry per route. A substring match on "Game"
	// is ambiguous between all of them.
	const option = page
		.locator('[data-slot="select-item"]')
		.filter({hasText: new RegExp(`^\\s*${name}\\s*$`)})
		.first();
	// LET THE OPEN LIST COME TO REST BEFORE CLICKING IN IT, or the click can be
	// dropped. The list opens with an animation, so a click started at once finds
	// the option "not stable", and Playwright's THIRD attempt scrolls it to the
	// top of the list before pressing. That scroll is programmatic: its `scroll`
	// event, and bits-ui's answer to it (the scroll-up button mounts and pushes
	// every item 24px down), come in the next frame. When that frame falls
	// between the press and the release, the release lands on the scroll button,
	// and bits-ui, which selects on the release of an ITEM, drops the click: the
	// list stays open on the old contract. Found in stratagems (2026-10-30): a
	// press, a frame, a release reproduce it every time. So the list is left to
	// finish opening, the option is brought into view here, and the list is left
	// to settle again, after which the click needs neither a retry nor a scroll.
	await option.evaluate(async (el) => {
		const list = el.closest('[data-slot="select-content"]') ?? el;
		const still = () =>
			new Promise<void>((resolve) => {
				const started = performance.now();
				let last = '';
				let frames = 0;
				const frame = () => {
					const r = el.getBoundingClientRect();
					const at = `${r.x},${r.y},${r.width},${r.height}`;
					const moving = list
						.getAnimations({subtree: true})
						.some((a) => a.playState === 'running');
					frames = at === last && !moving ? frames + 1 : 0;
					last = at;
					if (frames >= 3 || performance.now() - started > 5_000) resolve();
					else requestAnimationFrame(frame);
				};
				requestAnimationFrame(frame);
			});
		await still();
		el.scrollIntoView({block: 'nearest'});
		await still();
	});
	await option.click({timeout: 30_000});
	await expect.poll(selected, {timeout: 30_000}).toBe(name);
}

/**
 * The write form the suites drive, and its submit control.
 *
 * Exported because a suite asserts on the very control it clicked (that it says
 * "Executing..." and stops saying it), and two definitions of the same locator
 * is one definition too many.
 *
 * The submit control is matched on the STEM, so it is the same locator whether
 * it reads "Execute" or "Executing...". `/execute/i` matches only the first of
 * those, since "executing" does not contain "execute", and a test then reads as
 * though the button had vanished at exactly the moment it was busy.
 */
export const writeForm = (page: Page) =>
	page
		.locator('[class*="card"], [class*="function"]')
		.filter({has: page.getByText(WRITE_FUNCTION)})
		.first();

export const executeButton = (page: Page) =>
	writeForm(page).locator('button', {hasText: /execut/i});

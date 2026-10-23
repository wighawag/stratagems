import {expect, type Page} from '@playwright/test';

/**
 * Reading the game out of the app, for tests that drive it through the UI.
 *
 * Shared by every game suite rather than copied into each: these read state out
 * of the app (`globalThis.context`) instead of off the screen, so an assertion
 * fails on what the game BELIEVES rather than on how it rendered, and the
 * evaluate-boundary details (every bigint has to leave as a string, a store
 * subscription has to be unsubscribed by hand) are subtle enough that a second
 * copy would drift.
 */

/** Subscribe, take the value, unsubscribe. Written for the page context. */
const READ = `
	const read = (store) => {
		let value;
		const stop = store.subscribe((v) => (value = v));
		if (typeof stop === 'function') stop();
		else if (stop && typeof stop.unsubscribe === 'function') stop.unsubscribe();
		return value;
	};
`;

/** Read the submission out of the app, rather than inferring it from pixels. */
export async function submissionStep(page: Page): Promise<{
	step: string;
	message?: string;
	reserve?: string;
	cellID?: string;
	planned: number;
	/**
	 * How far a reveal that takes several transactions has got, when the
	 * submission is reporting one. Undefined for an ordinary single-transaction
	 * reveal and at every other step.
	 */
	revealProgress?: {done: number; total: number};
}> {
	return page.evaluate(`(() => {
		${READ}
		const context = globalThis.context;
		const submission = read(context.game.submission);
		const view = read(context.viewState);
		const reserve = read(context.game.reserve);

		// The cell this submission is about, and what the board says about it. Every
		// bigint leaves as a string: bigint cannot cross the evaluate boundary.
		const cellID =
			'actions' in submission && submission.actions.length > 0
				? submission.actions[0].cellID
				: undefined;

		return {
			step: submission.step,
			message: submission.message,
			reserve: reserve.step === 'Loaded' ? reserve.amount.toString() : undefined,
			cellID: cellID === undefined ? undefined : cellID.toString(),
			// Plain numbers, so it crosses the evaluate boundary as it stands.
			revealProgress: submission.progress,
			planned:
				view.step === 'Loaded'
					? [...view.cells.values()].filter((c) => c.planned).length
					: -1,
		};
	})()`) as Promise<{
		step: string;
		message?: string;
		reserve?: string;
		cellID?: string;
		planned: number;
		revealProgress?: {done: number; total: number};
	}>;
}

/**
 * THE CHUNK, as this deployment declares it.
 *
 * Read off the app's config rather than written down here, for exactly the
 * reason the client reads it off the deployment: a turn longer than this is
 * opened in several transactions, and a test that spelled the number out would
 * go on passing while the deploy said something else - which is the case it
 * exists to cover.
 */
export async function actionsPerReveal(page: Page): Promise<number> {
	return page.evaluate(
		`globalThis.context.game.config.actionsPerReveal`,
	) as Promise<number>;
}

/**
 * The cells the board is holding a share of for THIS player.
 *
 * Counted rather than named, because a multi-chunk turn is asserted by how much
 * of it has landed rather than by which cells: the plan comes from clicks whose
 * exact cells depend on the canvas size.
 */
export async function plannedCellIDs(page: Page): Promise<string[]> {
	return page.evaluate(`(() => {
		${READ}
		const submission = read(globalThis.context.game.submission);
		if (!('actions' in submission)) return [];
		return submission.actions.map((a) => a.cellID.toString());
	})()`) as Promise<string[]>;
}

/**
 * Put something at stake, whichever affordance is currently on screen.
 *
 * With an empty reserve the HUD shows the setup gate's own button INSTEAD of
 * the planning controls, and its label carries the price, so it is matched on
 * the stem; once there is a reserve the same action is a secondary "Add stake"
 * button. Both go through the acquisition rail.
 *
 * Driven through the UI rather than through `acquisition.buy()` so that the
 * gate, the payer choice and the consent step are all exercised.
 */
export async function stake(page: Page): Promise<void> {
	// BY TESTID, NOT BY LABEL. Both labels say what THIS game sells, and a game
	// that gates differently rewrites them: matching on the words made this
	// fixture fail on the first branch that sold an avatar instead of a bond,
	// thirty seconds at a time, with a timeout that named a button nobody had
	// removed. The testids are on the two controls in `GameHud.svelte`.
	const deposit = page.locator('[data-testid="acquire-stake"]');
	if (await deposit.isVisible({timeout: 5_000}).catch(() => false)) {
		await deposit.click();
	} else {
		await page.locator('[data-testid="acquire-more-stake"]').click();
	}

	// WHICHEVER PAYER IS OFFERED. With only one method the rail skips the choice
	// entirely, so this acts only if the chooser is actually up.
	const chooser = page.locator('[data-testid="acquire-payment-methods"]');
	if (await chooser.isVisible({timeout: 10_000}).catch(() => false)) {
		await page
			.locator('[data-testid="acquire-pay-with-account"]')
			.or(page.locator('[data-testid="acquire-pay-with-wallet"]'))
			.first()
			.click({timeout: 30_000});
	}

	// The consent step, when this purchase also has something to sign.
	const consent = page.getByRole('button', {name: /^(sign and buy|buy)$/i});
	if (await consent.isVisible({timeout: 10_000}).catch(() => false)) {
		await consent.click({timeout: 30_000});
	}
}

/** Where the cycle clock currently is. */
export async function currentPhase(
	page: Page,
): Promise<{phase: string; timeLeft: number}> {
	return page.evaluate(`(() => {
		${READ}
		const phase = read(globalThis.context.game.threePhase);
		return {phase: phase.phase, timeLeft: phase.timeLeft};
	})()`) as Promise<{phase: string; timeLeft: number}>;
}

/**
 * The confirmed stake on one cell, as the board reports it.
 *
 * Assertions are made against the CHANGE in this rather than against an
 * absolute figure: the e2e chain is shared and reused, so the cell may
 * already carry stake from an earlier run. Total stake rather than the
 * claimant count for the same reason - a second placement by an account that
 * already holds a share of the cell adds stake without adding a claimant.
 */
export async function stakeOnCell(page: Page, cellID: string): Promise<string> {
	return page.evaluate(
		`(() => {
			${READ}
			const view = read(globalThis.context.viewState);
			if (view.step !== 'Loaded') return '0';
			const cell = view.cells.get(BigInt('${cellID}'));
			return cell ? cell.totalStake.toString() : '0';
		})()`,
	) as Promise<string>;
}

/**
 * Let this browser play for the account, if the board is asking.
 *
 * A fresh browser's signer is nobody's delegate, so `makeCommitment` would
 * revert with `NotDelegate`. The board asks for this before it will accept a
 * plan, so a test has to answer it exactly as a player does: press the button
 * and complete the flow, which registers the signer and funds its gas in one
 * transaction.
 *
 * Conditional, and now usually a no-op: the setup gate asks for the STAKE
 * first, and acquiring one authorises this browser in the same transaction, so
 * a fresh account never sees this button. It is still reachable for an account
 * that already has a stake and is opening a second browser, which on a shared,
 * reused e2e chain is a real case.
 */
export async function authoriseToPlay(
	page: Page,
	authoriseBrowser: (page: Page, options?: {via?: string}) => Promise<unknown>,
): Promise<void> {
	const button = page.getByRole('button', {name: /authorise and carry on/i});
	if (!(await button.isVisible({timeout: 10_000}).catch(() => false))) return;
	await button.click();
	await authoriseBrowser(page);
	await expect(button, 'authorising should let the board move on').toBeHidden({
		timeout: 60_000,
	});
}

/**
 * Settle anything an earlier run left unrevealed, exactly as a person would.
 *
 * The e2e chain is shared and reused, and an unrevealed commitment blocks every
 * later one. It is NOT cleared automatically - acknowledging FORFEITS the bond,
 * so the player has to ask for it - which means the test has to ask too.
 */
export async function clearAnyMissedReveal(page: Page): Promise<void> {
	const acknowledge = page.getByRole('button', {
		name: /acknowledge missed reveal/i,
	});
	if (await acknowledge.isVisible({timeout: 5_000}).catch(() => false)) {
		await acknowledge.click();
		await expect(acknowledge, 'acknowledging should unblock play').toBeHidden({
			timeout: 60_000,
		});
	}
}

/**
 * Wait for a play phase with room left in it, then click a cell on the canvas.
 *
 * A plan made in the wrong part of the cycle is not a bug, it just expires: the
 * submission drops an uncommitted plan when the cycle turns over, since nothing
 * was at stake. `secondsNeeded` is how much of the play phase the caller still
 * has work to do in.
 *
 * The dialog check is not decoration. A connect dialog on its way out still
 * covers the middle of the screen for a couple of hundred milliseconds, and a
 * click that lands on it is swallowed silently - the submission simply never
 * becomes Planning, which reads like the canvas ignoring input. A person is
 * never fast enough to hit this; a test is.
 */
export async function planOnCanvas(
	page: Page,
	offset: {x: number; y: number},
	secondsNeeded = 8,
): Promise<void> {
	await expect
		.poll(
			async () => {
				const phase = await currentPhase(page);
				return phase.phase === 'play' && phase.timeLeft > secondsNeeded;
			},
			{
				message: `a play phase with at least ${secondsNeeded}s left`,
				timeout: 120_000,
			},
		)
		.toBe(true);

	await expect(page.locator('[role="dialog"]')).toHaveCount(0, {
		timeout: 15_000,
	});

	await clickCanvas(page, offset);

	await expect
		.poll(async () => (await submissionStep(page)).step, {
			message: 'clicking a cell should plan a placement',
			timeout: 15_000,
		})
		.toBe('Planning');
}

/**
 * Where {@link planManyOnCanvas} clicks, from the middle of the canvas out.
 *
 * KEPT WELL INSIDE THE CANVAS. The HUD sits over its edges, and a click that
 * lands on a control is swallowed with no symptom at all - the plan simply does
 * not grow, which reads as the canvas ignoring input.
 *
 * SIXTY PIXELS APART because the camera is configured in CELLS and not pixels:
 * at the default zoom (24 cells across the viewport) a cell is around 25 pixels
 * wide, so this is a couple of cells between rungs, with room for a viewport
 * half the expected size before two rungs could land on one cell.
 */
const FIRST_OFFSET = {x: 0, y: -60};
const LADDER = [
	{x: -120, y: -60},
	{x: 120, y: -60},
	{x: -60, y: 0},
	{x: 60, y: 0},
	{x: -120, y: 0},
	{x: 120, y: 0},
	{x: -60, y: 60},
	{x: 60, y: 60},
	{x: -120, y: 60},
	{x: 120, y: 60},
];

/**
 * Plan `count` DISTINCT cells, for a turn bigger than one transaction.
 *
 * It steps the offset outwards and CHECKS after every click, rather than
 * assuming a cell is so many pixels wide. Two reasons, and both have bitten a
 * canvas test before: how many pixels a cell occupies depends on the viewport
 * (the camera is configured in CELLS, not pixels), and a click landing on a cell
 * that is already planned TOGGLES IT BACK OFF - placements cost stake, so a
 * mis-click has to be undoable. A fixed ladder of offsets that happened to hit
 * one cell twice would quietly plan fewer cells than it asked for and the test
 * would fail somewhere else entirely.
 *
 * The first click goes through {@link planOnCanvas}, so the whole run still
 * waits for a play phase with room left in it.
 */
export async function planManyOnCanvas(
	page: Page,
	count: number,
	secondsNeeded = 14,
): Promise<void> {
	await planOnCanvas(page, FIRST_OFFSET, secondsNeeded);

	let planned = 1;
	for (const offset of LADDER) {
		if (planned >= count) break;
		await clickCanvas(page, offset);
		const now = (await submissionStep(page)).planned;
		if (now < planned) {
			// That click landed on a cell already in the plan and took it back out.
			// Put it back and move on: at this zoom the spacing is a couple of cells
			// so it should not happen, and if the viewport ever makes it happen the
			// ladder simply costs a rung.
			await clickCanvas(page, offset);
		} else {
			planned = now;
		}
	}

	expect(planned, `should have planned ${count} distinct cells`).toBe(count);
}

/**
 * Click a cell, with no wait for the clock.
 *
 * {@link planOnCanvas} is the one to reach for: waiting for room in the play
 * phase is what keeps a plan from expiring under the test. This is for the case
 * where the clock is already the thing under test and the wait would defeat it
 * - recovering a submission has to finish inside the cycle the commitment
 * belongs to, so it cannot afford to wait for the NEXT play phase, which is by
 * definition too late.
 *
 * Clicks are gated on setup rather than on the phase (see the click handler in
 * `placement/context.ts`), so this is a real affordance and not a test-only door.
 */
export async function clickCanvas(
	page: Page,
	offset: {x: number; y: number},
): Promise<void> {
	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('the canvas has no layout box');
	await page.mouse.click(
		box.x + box.width / 2 + offset.x,
		box.y + box.height / 2 + offset.y,
	);
}

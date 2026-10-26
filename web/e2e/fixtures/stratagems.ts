/**
 * STRATAGEMS' GAME, as the e2e suite drives it: the reference game's
 * `fixtures/game.ts` (omitted here) for stratagems' move, board and stake.
 *
 * The helpers read state out of the app (`globalThis.context`) rather than off
 * the screen, so an assertion fails on what the game believes rather than on how
 * it rendered.
 */
import {expect, type Page} from '@playwright/test';
import {encodeFunctionData, erc20Abi, parseEther} from 'viem';

const env = (globalThis as any).process.env;
const RPC_URL =
	env.E2E_RPC_URL || `http://127.0.0.1:${env.E2E_RPC_PORT || '8545'}`;

/**
 * Who holds the TestTokens on a local deploy: `tokensBeneficiary`, the second
 * account of the test mnemonic (`contracts/rocketh/config.ts`), which the node
 * holds unlocked.
 */
const TOKENS_BENEFICIARY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const READ = `
	const read = (store) => {
		let value;
		const stop = store.subscribe((v) => (value = v));
		if (typeof stop === 'function') stop();
		else if (stop && typeof stop.unsubscribe === 'function') stop.unsubscribe();
		return value;
	};
`;

async function rpc(method: string, params: unknown[]): Promise<any> {
	const response = await fetch(RPC_URL, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
	});
	const json = await response.json();
	if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
	return json.result;
}

/**
 * Give the signed-in account gems, from the deploy's token holder: the stake is
 * gems moved from the wallet into the reserve, and getting gems is the TestTokens
 * claim, which is step 6c's.
 */
export async function giveGems(page: Page, amount = '100'): Promise<void> {
	const {account, tokens} = (await page.evaluate(`(() => {
		${READ}
		return {
			account: read(globalThis.context.account),
			tokens: globalThis.context.deployments.get().contracts.TestTokens.address,
		};
	})()`)) as {account: `0x${string}`; tokens: `0x${string}`};
	const hash = await rpc('eth_sendTransaction', [
		{
			from: TOKENS_BENEFICIARY,
			to: tokens,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: 'transfer',
				args: [account, parseEther(amount)],
			}),
		},
	]);
	await expect
		.poll(async () => (await rpc('eth_getTransactionReceipt', [hash]))?.status, {
			message: 'the gems should reach the account',
			timeout: 30_000,
		})
		.toBe('0x1');
}

export type GameStep = {
	step: string;
	message?: string;
	reserve?: string;
	planned: number;
	moves: {position: string; color: number}[];
	phase: string;
	timeLeft: number;
	account?: string;
};

export async function gameStep(page: Page): Promise<GameStep> {
	return page.evaluate(`(() => {
		${READ}
		const context = globalThis.context;
		const submission = read(context.game.submission);
		const reserve = read(context.game.reserve);
		const phase = read(context.game.threePhase);
		const moves = 'actions' in submission ? submission.actions : [];
		return {
			step: submission.step,
			message: submission.message,
			reserve: reserve.step === 'Loaded' ? reserve.amount.toString() : undefined,
			planned: moves.length,
			moves: moves.map((m) => ({position: m.position.toString(), color: m.color})),
			phase: phase.phase,
			timeLeft: phase.timeLeft,
			account: read(context.account),
		};
	})()`) as Promise<GameStep>;
}

/** A cell as the board (the held view) shows it, or undefined. */
export async function cellOnBoard(
	page: Page,
	position: string,
): Promise<{color: number; life: number; owner?: string; planned?: number} | undefined> {
	return page.evaluate(`(() => {
		${READ}
		const view = read(globalThis.context.viewState);
		if (view.step !== 'Loaded') return undefined;
		const cell = view.cells.get('${position}');
		return cell ? {color: cell.color, life: cell.life, owner: cell.owner, planned: cell.planned} : undefined;
	})()`) as Promise<{color: number; life: number; owner?: string; planned?: number} | undefined>;
}

/** Press the stake button and answer what the rail asks. */
export async function stake(page: Page): Promise<void> {
	const deposit = page.locator('[data-testid="acquire-stake"]');
	if (await deposit.isVisible({timeout: 10_000}).catch(() => false)) {
		await deposit.click();
	} else {
		await page.locator('[data-testid="acquire-more-stake"]').click();
	}
	const chooser = page.locator('[data-testid="acquire-payment-methods"]');
	if (await chooser.isVisible({timeout: 10_000}).catch(() => false)) {
		await page
			.locator('[data-testid="acquire-pay-with-account"]')
			.or(page.locator('[data-testid="acquire-pay-with-wallet"]'))
			.first()
			.click({timeout: 30_000});
	}
	const consent = page.getByRole('button', {name: /^(sign and buy|buy)$/i});
	if (await consent.isVisible({timeout: 10_000}).catch(() => false)) {
		await consent.click({timeout: 30_000});
	}
}

/** Let this browser play as the account, if the setup gate asks. */
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

/**
 * Cells around the middle, far enough apart (more than a cell at the initial
 * zoom) that no two land on one. The chain is shared and reused across runs, so a
 * cell may be another player's living cell, which a click may not plan: the
 * ladder goes on until enough are planned.
 */
const LADDER = [
	{x: 0, y: -90},
	{x: 90, y: 0},
	{x: -90, y: 0},
	{x: 0, y: 90},
	{x: 90, y: -90},
	{x: -90, y: 90},
	{x: 180, y: 0},
	{x: -180, y: 0},
	{x: 0, y: -180},
	{x: 180, y: 180},
	{x: -180, y: -180},
	{x: 180, y: -180},
];

/** Plan `count` moves in one play phase with at least `secondsNeeded` left. */
export async function planMoves(
	page: Page,
	count: number,
	secondsNeeded = 15,
): Promise<void> {
	await expect
		.poll(
			async () => {
				const step = await gameStep(page);
				return step.phase === 'play' && step.timeLeft > secondsNeeded;
			},
			{
				message: `a play phase with at least ${secondsNeeded}s left`,
				timeout: 120_000,
			},
		)
		.toBe(true);
	await expect(page.locator('[role="dialog"]')).toHaveCount(0, {timeout: 15_000});
	let planned = (await gameStep(page)).planned;
	for (const offset of LADDER) {
		if (planned >= count) break;
		await clickCanvas(page, offset);
		await page.waitForTimeout(200);
		const now = (await gameStep(page)).planned;
		// a click on a cell already planned takes it back: put it back
		if (now < planned) await clickCanvas(page, offset);
		planned = (await gameStep(page)).planned;
	}
	expect(planned, `should have planned ${count} moves`).toBe(count);
}

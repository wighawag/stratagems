import type {Page} from '@playwright/test';
import {mnemonicToAccount} from 'viem/accounts';
import {test, expect, describe} from '../fixtures/test';

/**
 * AI SEATS IN STRATAGEMS' OFFLINE WORLD: one person against two world seats at
 * the `greedy` level, two cycles (step A2 of
 * work/plans/join-template-commit-reveal.md, A2-10).
 *
 * What it holds: the lobby offers a level per world seat and the world plays
 * them; each greedy seat decides its move in the commit phase and stores it
 * before committing (`offline-world:played-turns`), on a cell that was empty
 * when the commit phase opened (two greedy seats may still meet on one cell,
 * since neither sees the other's commitment, so each seat's cell is asserted
 * coloured, not owned); a reload in the reveal phase still closes the cycle,
 * the seats revealing the moves they stored rather than deciding again on a
 * board that has moved; and every decision is timed in the browser against
 * A2-8's gate.
 *
 * The template's `offline-ai.e2e.ts` reads the reference game and is omitted
 * here for ever (`.offshoot-omissions`); the reload trick is its.
 *
 * IT CLAIMS NO ACCOUNT FROM THE SHARED POOL: every transaction is on a chain
 * inside this test's page.
 */

const READ = `
	const world = globalThis.offlineWorld;
	const game = world && world.world.deployments.get().contracts.Stratagems;
	const call = (functionName, args = []) =>
		world.context.publicClient.readContract({
			address: game.address,
			abi: game.abi,
			functionName,
			args,
		});
`;

/** The person's cells: outside the 13 by 13 block the seats play in, on screen. */
const HUMAN_CELLS = [
	{x: 9, y: 0},
	{x: 9, y: 3},
];

/** A2-8: the median decision, in the browser, on a small board. */
const DECISION_GATE_MS = 500;

/** Click the middle of the cell at x,y, through the world's own camera. */
async function clickCell(page: Page, cell: {x: number; y: number}) {
	const offset = (await page.evaluate(`(() => {
		const {transform} = globalThis.offlineWorld.context.render.cameraControl.current;
		return {
			x: (${cell.x} - transform.centerX) * transform.scale,
			y: (${cell.y} - transform.centerY) * transform.scale,
		};
	})()`)) as {x: number; y: number};
	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('the canvas has no layout box');
	await page.mouse.click(
		box.x + box.width / 2 + offset.x,
		box.y + box.height / 2 + offset.y,
	);
}

/** Where the cycle is, from the chain. */
async function cycleOnChain(
	page: Page,
): Promise<{cycleNumber: number; commiting: boolean} | undefined> {
	return page.evaluate(`(async () => {
		${READ}
		if (!world) return undefined;
		const cycle = await call('getCycle');
		return {cycleNumber: Number(cycle.cycleNumber), commiting: cycle.commiting};
	})()`) as Promise<{cycleNumber: number; commiting: boolean} | undefined>;
}

/** The world seats' stored moves for a cycle: one cell position per seat. */
async function storedTurns(page: Page, cycleNumber: number): Promise<string[]> {
	return page.evaluate(`(() => {
		const raw = localStorage.getItem('offline-world:played-turns');
		const records = raw ? JSON.parse(raw) : [];
		return records
			.filter((record) => record.cycleNumber === ${cycleNumber})
			.flatMap((record) => record.actions.map((action) => String(action[0])));
	})()`) as Promise<string[]>;
}

/** The world seats' identities, from their stored turns. */
async function storedIdentities(page: Page): Promise<string[]> {
	return page.evaluate(`(() => {
		const raw = localStorage.getItem('offline-world:played-turns');
		const records = raw ? JSON.parse(raw) : [];
		return [...new Set(records.map((record) => record.identity))];
	})()`) as Promise<string[]>;
}

/** Each seat's commitment cycle on chain. */
async function committedIn(
	page: Page,
	identities: string[],
): Promise<number[]> {
	return page.evaluate(`(async () => {
		${READ}
		const out = [];
		for (const identity of ${JSON.stringify(identities)}) {
			const commitment = await call('getCommitment', [BigInt(identity)]);
			out.push(Number(commitment.cycleNumber));
		}
		return out;
	})()`) as Promise<number[]>;
}

/** The colour a cell is stored with on chain, now (0: empty). */
async function colourOf(page: Page, position: string): Promise<number> {
	return page.evaluate(`(async () => {
		${READ}
		const [cell] = await call('getStoredCells', [[BigInt('${position}')]]);
		return Number(cell.cell.color);
	})()`) as Promise<number>;
}

/** How many have revealed this cycle. */
async function revealed(page: Page): Promise<number> {
	return page.evaluate(`(async () => {
		${READ}
		const attendance = await call('getAttendance');
		return Number(attendance.revealed);
	})()`) as Promise<number>;
}

/** The AI seats' decisions so far, as the world measured them. */
async function decisionTimes(page: Page): Promise<number[]> {
	return page.evaluate(
		`(globalThis.offlineWorld?.decisions ?? []).map((d) => d.ms)`,
	) as Promise<number[]>;
}

/** The world's first two seats' addresses: the well-known list from index 2. */
const WORLD_SEATS = [2, 3].map(
	(addressIndex) =>
		mnemonicToAccount(
			'test test test test test test test test test test test junk',
			{addressIndex},
		).address,
);

/**
 * TAKE THE WORLD SEATS' GAS, with the in-tab node's own cheat call: their
 * reveals then fail and are retried every pass, so the cycle stays in its
 * reveal phase. A boot gives every world seat its gas again, which is what a
 * reload does.
 */
async function drainWorldSeatsGas(page: Page): Promise<void> {
	await page.evaluate(`(async () => {
		const provider = globalThis.offlineWorld.world.provider;
		for (const address of ${JSON.stringify(WORLD_SEATS)}) {
			await provider.request({method: 'evm_setBalance', params: [address, '0x0']});
		}
	})()`);
}

/**
 * Wait for this cycle's commit phase and both seats' stored moves, each on a
 * cell empty now: in a manual commit phase nothing is revealed, so the board
 * now is the board the phase opened on.
 */
async function greedySeatsDecided(
	page: Page,
	cycleNumber: number,
): Promise<string[]> {
	await expect
		.poll(() => cycleOnChain(page), {timeout: 60_000})
		.toEqual({cycleNumber, commiting: true});
	await expect
		.poll(async () => (await storedTurns(page, cycleNumber)).length, {
			timeout: 30_000,
		})
		.toBe(2);
	const cells = await storedTurns(page, cycleNumber);
	expect((await cycleOnChain(page))?.commiting).toBe(true);
	for (const cell of cells) expect(await colourOf(page, cell)).toBe(0);
	return cells;
}

/** Plan one move outside the seats' block and commit it. */
async function playOneCell(
	page: Page,
	cell: {x: number; y: number},
): Promise<void> {
	await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
	await clickCell(page, cell);
	await page.waitForTimeout(200);
	await page.getByRole('button', {name: /commit now/i}).click();
}

describe('AI seats in stratagems\u2019 offline world', () => {
	test('one person against two greedy world seats, two cycles, a reload in the reveal phase', async ({
		page,
	}) => {
		test.setTimeout(6 * 60_000);
		await page.goto('/offline/');

		await expect(page.getByText('How many at the table?')).toBeVisible({
			timeout: 60_000,
		});
		await page.getByTestId('seats-3').click();
		await page.getByTestId('level-0-greedy').click();
		await page.getByTestId('level-1-greedy').click();
		await expect(page.getByText('The world (Greedy)')).toHaveCount(2);
		await page.getByTestId('sit-down').click();
		await expect(
			page.getByText('Everything below runs against a chain inside this tab'),
		).toBeVisible({timeout: 120_000});

		// CYCLE TWO: the seats decide on the opening board and store first.
		const first = await greedySeatsDecided(page, 2);
		await playOneCell(page, HUMAN_CELLS[0]);
		await expect
			.poll(async () => (await cycleOnChain(page))?.cycleNumber, {
				timeout: 120_000,
			})
			.toBe(3);
		for (const cell of first) expect(await colourOf(page, cell)).not.toBe(0);

		// CYCLE THREE, on a board that now holds cycle two's cells.
		const second = await greedySeatsDecided(page, 3);
		const seats = await storedIdentities(page);
		expect(seats).toHaveLength(2);
		await expect
			.poll(() => committedIn(page, seats), {timeout: 30_000})
			.toEqual([3, 3]);
		expect(await revealed(page)).toBe(0);
		const times = await decisionTimes(page);

		// THE RELOAD LANDS IN THE REVEAL PHASE, BY CONSTRUCTION: the seats are left
		// without gas, the person commits and reveals, the cycle waits for the
		// seats, and the page is reloaded with their reveals owed.
		await drainWorldSeatsGas(page);
		await playOneCell(page, HUMAN_CELLS[1]);
		await expect
			.poll(() => cycleOnChain(page), {timeout: 60_000})
			.toEqual({cycleNumber: 3, commiting: false});
		await expect.poll(() => revealed(page), {timeout: 60_000}).toBe(1);
		for (const cell of second) expect(await colourOf(page, cell)).toBe(0);
		await page.reload();

		// The cycle closes all the same: the seats revealed what they stored.
		await expect
			.poll(async () => (await cycleOnChain(page))?.cycleNumber, {
				timeout: 90_000,
			})
			.toBe(4);
		for (const cell of second) expect(await colourOf(page, cell)).not.toBe(0);
		// AND THE MOVES WERE NOT DECIDED AGAIN: one stored move per seat and cycle.
		expect(await storedTurns(page, 3)).toEqual(second);

		// A2-8: the decisions, timed in this browser.
		const sorted = [...times].sort((a, b) => a - b);
		console.log(`greedy decisions in the browser: ${sorted.join(', ')} ms`);
		expect(sorted).toHaveLength(4);
		expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThanOrEqual(
			DECISION_GATE_MS,
		);
	});
});

import type {Page} from '@playwright/test';
import {mnemonicToAccount} from 'viem/accounts';
import {test, expect, describe} from '../fixtures/test';

/**
 * AI SEATS IN THE OFFLINE WORLD: one person against two world seats at the
 * `greedy` level, two cycles (stratagems' port plan, step A1).
 *
 * What it holds: the lobby offers a level per world seat and the world plays
 * them; each greedy seat decides its turn in the commit phase and stores it
 * before committing (`offline-world:played-turns`), on a cell that held no
 * stake when the commit phase opened (two greedy seats may still meet on one
 * cell, since neither sees the other's commitment, so it is asserted per seat);
 * and a reload in the reveal phase still closes the cycle, the seats revealing
 * the turns they stored rather than deciding again on a board that has moved.
 *
 * Written against the byte-identical route and world only, and the chain read
 * through `globalThis.offlineWorld`, so a game that offers levels adapts the
 * cell read and nothing else. A game whose world offers no levels skips it.
 */

const READ = `
	const read = (store) => {
		let value;
		const stop = store.subscribe((v) => (value = v));
		if (typeof stop === 'function') stop();
		else if (stop && typeof stop.unsubscribe === 'function') stop.unsubscribe();
		return value;
	};
	const world = globalThis.offlineWorld;
	const game = world && world.world.deployments.get().contracts.Game;
	const call = (functionName, args = []) =>
		world.context.publicClient.readContract({
			address: game.address,
			abi: game.abi,
			functionName,
			args,
		});
`;

/** Click the board at an offset from its centre. */
async function clickCanvas(
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

/** Where the cycle is, from the chain. */
async function cycleOnChain(
	page: Page,
): Promise<{cycleNumber: number; commiting: boolean} | undefined> {
	return page.evaluate(`(async () => {
		${READ}
		// Before the world is up (after a reload) there is nothing to read yet.
		if (!world) return undefined;
		const cycle = await call('getCycle');
		return {cycleNumber: Number(cycle.cycleNumber), commiting: cycle.commiting};
	})()`) as Promise<{cycleNumber: number; commiting: boolean} | undefined>;
}

/** The world seats' stored turns for a cycle: one cell id per seat. */
async function storedTurns(page: Page, cycleNumber: number): Promise<string[]> {
	return page.evaluate(`(() => {
		const raw = localStorage.getItem('offline-world:played-turns');
		const records = raw ? JSON.parse(raw) : [];
		return records
			.filter((record) => record.cycleNumber === ${cycleNumber})
			.flatMap((record) => record.actions.map(String));
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

/**
 * The world's first two seats' addresses: the well-known list from index 2
 * (`$lib/game/lobby/seats`), the same on every branch whatever an identity is.
 */
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
 * reveal phase. A boot gives every world seat its gas again (provisioning runs
 * on a restore too), which is what a reload does.
 */
async function drainWorldSeatsGas(page: Page): Promise<void> {
	await page.evaluate(`(async () => {
		const provider = globalThis.offlineWorld.world.provider;
		for (const address of ${JSON.stringify(WORLD_SEATS)}) {
			await provider.request({method: 'evm_setBalance', params: [address, '0x0']});
		}
	})()`);
}

/** How many have revealed this cycle. */
async function revealed(page: Page): Promise<number> {
	return page.evaluate(`(async () => {
		${READ}
		const attendance = await call('getAttendance');
		return Number(attendance.revealed);
	})()`) as Promise<number>;
}

/** What a cell holds on chain, now. */
async function cellOnChain(
	page: Page,
	cellID: string,
): Promise<{totalStake: string; numClaimants: number}> {
	return page.evaluate(`(async () => {
		${READ}
		const cell = await call('getCell', [BigInt('${cellID}')]);
		return {totalStake: cell.totalStake.toString(), numClaimants: Number(cell.numClaimants)};
	})()`) as Promise<{totalStake: string; numClaimants: number}>;
}

/**
 * Wait for this cycle's commit phase, then check the world seats decided on a
 * board where their cells were free: in a manual commit phase nothing is
 * revealed, so the board now is the board the phase opened on.
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
	for (const cell of cells) {
		expect((await cellOnChain(page, cell)).totalStake).toBe('0');
	}
	return cells;
}

/** Plan one placement and commit it. */
async function playOneCell(
	page: Page,
	offset: {x: number; y: number},
): Promise<void> {
	const canvas = page.locator('canvas');
	await expect(canvas).toBeVisible({timeout: 30_000});
	await clickCanvas(page, offset);
	await page.getByRole('button', {name: /commit now/i}).click();
}

describe('AI seats in the offline world', () => {
	test('one person against two greedy world seats, two cycles, a reload in the reveal phase', async ({
		page,
	}) => {
		test.setTimeout(6 * 60_000);
		await page.goto('/offline/');

		await expect(page.getByText('How many at the table?')).toBeVisible({
			timeout: 60_000,
		});
		await page.getByTestId('seats-3').click();
		// A GAME WHOSE WORLD OFFERS NO LEVELS (its `$lib/offline` exports no
		// `AI_LEVELS`) shows no choice, and this file arrives in it unchanged.
		test.skip(
			(await page.getByTestId('level-0-greedy').count()) === 0,
			"this game's offline world offers no levels",
		);
		await page.getByTestId('level-0-greedy').click();
		await page.getByTestId('level-1-greedy').click();
		await expect(page.getByText('The world (Greedy)')).toHaveCount(2);
		await page.getByTestId('sit-down').click();
		await expect(
			page.getByText('Everything below runs against a chain inside this tab'),
		).toBeVisible({timeout: 120_000});

		// CYCLE TWO: the seats decide on the opening board and store first.
		const first = await greedySeatsDecided(page, 2);
		await playOneCell(page, {x: 40, y: 30});
		await expect(
			page.getByText('Revealed. Your placements are on the board.'),
		).toBeVisible({timeout: 60_000});
		await expect
			.poll(async () => (await cycleOnChain(page))?.cycleNumber, {
				timeout: 60_000,
			})
			.toBe(3);
		for (const cell of first) {
			expect(
				(await cellOnChain(page, cell)).numClaimants,
			).toBeGreaterThanOrEqual(1);
		}

		// CYCLE THREE, on a board that now holds cycle two's cells: the seats'
		// cells were free on it, so greedy saw them taken.
		const second = await greedySeatsDecided(page, 3);
		const seats = await storedIdentities(page);
		expect(seats).toHaveLength(2);
		await expect
			.poll(() => committedIn(page, seats), {timeout: 30_000})
			.toEqual([3, 3]);
		// Committed and still owing: the person has not committed yet.
		expect(await revealed(page)).toBe(0);

		// THE RELOAD LANDS IN THE REVEAL PHASE, BY CONSTRUCTION. A reveal phase
		// left alone lasts less than one poll here (measured: the seats and the
		// person reveal right after the advance), so the seats are left without
		// gas: the person commits and reveals, the cycle waits for the seats, and
		// the page is reloaded with their reveals owed.
		await drainWorldSeatsGas(page);
		await playOneCell(page, {x: -60, y: -40});
		await expect
			.poll(() => cycleOnChain(page), {timeout: 60_000})
			.toEqual({cycleNumber: 3, commiting: false});
		await expect(
			page.getByText('Revealed. Your placements are on the board.'),
		).toBeVisible({timeout: 60_000});
		await expect.poll(() => revealed(page), {timeout: 30_000}).toBe(1);
		expect(await cycleOnChain(page)).toEqual({
			cycleNumber: 3,
			commiting: false,
		});
		for (const cell of second) {
			expect((await cellOnChain(page, cell)).totalStake).toBe('0');
		}
		await page.reload();

		// The cycle closes all the same: the seats revealed what they stored.
		await expect
			.poll(async () => (await cycleOnChain(page))?.cycleNumber, {
				timeout: 90_000,
			})
			.toBe(4);
		for (const cell of second) {
			expect(
				(await cellOnChain(page, cell)).numClaimants,
			).toBeGreaterThanOrEqual(1);
		}
		// AND THE TURNS WERE NOT DECIDED AGAIN: one stored turn per seat and cycle.
		expect(await storedTurns(page, 3)).toEqual(second);
	});
});

import {createPublicClient, http, parseAbiItem, type Hex} from 'viem';
import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';
import {
	actionsPerReveal,
	authoriseToPlay,
	clearAnyMissedReveal,
	currentPhase,
	planManyOnCanvas,
	plannedCellIDs,
	stake,
	stakeOnCell,
	submissionStep,
} from '../fixtures/game';
import {
	freezeFuzd,
	fuzdExecution,
	remoteAccountOf,
	thawFuzd,
} from '../fixtures/fuzd';

/**
 * A REVEAL SENT BY FUZD (`with/fuzd`, stratagems' plan step 8, P10), end to end
 * against a real chain and the real fuzd CLI.
 *
 * The claim is the layer's whole reason to exist: a player who commits and
 * closes the tab still reveals, and keeps their stake. So the page is CLOSED
 * before the reveal phase, and a new page opened after the cycle has turned
 * must find the turn `Revealed` (not `Missed`), the cells on the board, and the
 * reveal sent by the player's REMOTE account, which only fuzd holds the key of.
 * A turn of several chunks is one batch, broadcast in order.
 *
 * And the layer's fallback: with fuzd down after the turn was scheduled, the
 * browser, still open, reveals it itself at half the reveal phase (P7), from
 * its own key.
 *
 * SERIAL, and in a project of its own that runs after every other suite and is
 * the only one fuzd runs for (see `FUZD_SUITE` in playwright.config.ts): the
 * last test freezes fuzd.
 */

const RPC_URL =
	(globalThis as any).process.env.E2E_RPC_URL ||
	`http://127.0.0.1:${(globalThis as any).process.env.E2E_RPC_PORT || '8545'}`;
const chain = createPublicClient({transport: http(RPC_URL)});

const COMMITMENT_MADE = parseAbiItem(
	'event CommitmentMade(uint256 indexed player, uint64 indexed cycleNumber, bytes24 commitmentHash, uint256 bond)',
);
const COMMITMENT_REVEALED = parseAbiItem(
	'event CommitmentRevealed(uint256 indexed player, uint64 indexed cycleNumber, bytes24 commitmentHash, bytes24 furtherActions, uint256 cost)',
);

type Schedule = {
	chainId: string;
	account: string;
	remoteAccount: string;
	slot: string;
	cycleNumber: number;
	batchSize: number;
	revealDueAt: number;
	expiryDelta: number;
	inClear: boolean;
};

/** What the app knows about who plays, who signs, and the game. */
async function appFacts(page: Page) {
	return page.evaluate(`(() => {
		const read = (store) => {
			let value;
			const stop = store.subscribe((v) => (value = v));
			if (typeof stop === 'function') stop();
			return value;
		};
		const context = globalThis.context;
		const signer = read(context.signerExecutor);
		return {
			identity: read(context.game.activeIdentity),
			signer: signer.status === 'ready' ? signer.address.toLowerCase() : undefined,
			game: context.deployments.get().contracts.Game.address,
			placementCost: context.game.config.placementCost.toString(),
		};
	})()`) as Promise<{
		identity: string;
		signer: string;
		game: `0x${string}`;
		placementCost: string;
	}>;
}

/** The scheduled reveal as the app holds it: the record stored with the turn. */
async function revealSchedule(page: Page): Promise<
	| {
			cycleNumber: number;
			revealScheduled?: boolean;
			schedule?: Schedule;
			status?: {step: string};
	  }
	| undefined
> {
	return page.evaluate(`(() => {
		let value;
		const stop = globalThis.context.game.revealSchedule.subscribe((v) => (value = v));
		stop();
		return value ? JSON.parse(JSON.stringify(value)) : undefined;
	})()`) as never;
}

async function missedRevealStep(page: Page): Promise<string> {
	return page.evaluate(`(() => {
		let value;
		const stop = globalThis.context.game.missedReveal.subscribe((v) => (value = v));
		stop();
		return value.step;
	})()`) as Promise<string>;
}

/** The chain's record of one player's turn in one cycle. */
async function turnOnChain(
	game: `0x${string}`,
	identity: string,
	cycleNumber: number,
) {
	const args = {player: BigInt(identity), cycleNumber: BigInt(cycleNumber)};
	const [made] = await chain.getLogs({
		address: game,
		event: COMMITMENT_MADE,
		args,
		fromBlock: 0n,
	});
	const reveals = await chain.getLogs({
		address: game,
		event: COMMITMENT_REVEALED,
		args,
		fromBlock: 0n,
	});
	reveals.sort((a, b) =>
		a.blockNumber === b.blockNumber
			? a.logIndex - b.logIndex
			: Number(a.blockNumber - b.blockNumber),
	);
	return {made, reveals};
}

/**
 * Stake, plan `count` cells, commit, and wait for the turn to be committed AND
 * scheduled, all inside the commit phase.
 */
async function commitAScheduledTurn(
	page: Page,
	authoriseBrowser: Parameters<typeof authoriseToPlay>[1],
	count: number,
) {
	await authoriseToPlay(page, authoriseBrowser);
	await clearAnyMissedReveal(page);
	await stake(page);
	await expect
		.poll(async () => (await submissionStep(page)).reserve !== '0', {
			message: 'a reserve to bond from',
			timeout: 60_000,
		})
		.toBe(true);

	await planManyOnCanvas(page, count, 18);
	const cells = await plannedCellIDs(page);
	expect(cells).toHaveLength(count);
	const before = new Map<string, bigint>();
	for (const cellID of cells) {
		before.set(cellID, BigInt(await stakeOnCell(page, cellID)));
	}

	await page.getByRole('button', {name: /commit now/i}).click();
	await expect
		.poll(async () => (await submissionStep(page)).step, {
			message: 'the commitment should reach the chain',
			timeout: 60_000,
		})
		.toBe('Committed');

	const scheduled = await revealSchedule(page);
	expect(
		scheduled?.revealScheduled,
		'the reveal should be scheduled with fuzd',
	).toBe(true);
	const schedule = scheduled!.schedule!;
	expect(schedule.slot).toBe(`cycle_${scheduled!.cycleNumber}`);
	expect(schedule.inClear, 'the local chain schedules in clear (P6)').toBe(
		true,
	);
	await expect(page.locator('[data-testid="reveal-schedule"]')).toHaveAttribute(
		'data-step',
		'scheduled',
	);
	await expect(page.locator('[data-testid="reveal-schedule"]')).toContainText(
		/revealed for you/i,
	);
	return {cells, before, schedule, cycleNumber: scheduled!.cycleNumber};
}

describe('A reveal sent by fuzd', () => {
	// Its own burner account, like every suite that sends transactions.
	test.use({walletAccountIndex: 7});
	test.describe.configure({mode: 'serial'});

	async function closedPageReveal(
		page: Page,
		authoriseBrowser: Parameters<typeof authoriseToPlay>[1],
		count: number,
	) {
		const facts = await appFacts(page);
		expect(facts.signer, 'the browser key should be ready').toBeTruthy();
		const turn = await commitAScheduledTurn(page, authoriseBrowser, count);
		const chunk = await actionsPerReveal(page);
		const chunks = Math.ceil(count / chunk);
		expect(turn.schedule.batchSize, 'the whole reveal is one batch').toBe(
			chunks,
		);

		// CLOSED BEFORE THE REVEAL PHASE: nothing of this browser is left to
		// reveal it.
		const phase = await currentPhase(page);
		expect(phase.phase, 'the page must close before the reveal phase').not.toBe(
			'reveal',
		);
		const browserContext = page.context();
		await page.close();

		// The cycle turns with no page open.
		await expect
			.poll(
				async () =>
					Number((await chain.getBlock()).timestamp) >=
					turn.schedule.revealDueAt + turn.schedule.expiryDelta,
				{message: 'the reveal phase should pass', timeout: 120_000},
			)
			.toBe(true);

		const onChain = await turnOnChain(
			facts.game,
			facts.identity,
			turn.cycleNumber,
		);
		expect(onChain.made, 'the commitment is on chain').toBeTruthy();
		expect(onChain.reveals, 'every chunk revealed').toHaveLength(chunks);

		// SENT BY THE REMOTE ACCOUNT, as ONE batch in order: consecutive nonces
		// from one sender, each chunk opening the head the previous one left.
		const remote = await remoteAccountOf(facts.signer);
		expect(turn.schedule.remoteAccount).toBe(remote);
		expect(turn.schedule.account, 'fuzd keys a schedule by its signer').toBe(
			facts.signer,
		);
		const transactions = await Promise.all(
			onChain.reveals.map((log) =>
				chain.getTransaction({hash: log.transactionHash as Hex}),
			),
		);
		let head = onChain.made.args.commitmentHash;
		transactions.forEach((transaction, i) => {
			expect(
				transaction.from.toLowerCase(),
				'the reveal is sent by the remote account',
			).toBe(remote);
			expect(transaction.nonce).toBe(transactions[0].nonce + i);
			expect(onChain.reveals[i].args.commitmentHash).toBe(head);
			head = onChain.reveals[i].args.furtherActions;
		});
		expect(BigInt(head ?? '0x1'), 'the last chunk closes the turn').toBe(0n);
		for (let i = 0; i < chunks; i++) {
			const execution = await fuzdExecution(turn.schedule, i);
			expect(execution?.hash, `fuzd broadcast batch transaction ${i}`).toBe(
				onChain.reveals[i].transactionHash,
			);
		}

		// A NEW PAGE, after the cycle has turned: revealed, not missed.
		const later = await browserContext.newPage();
		await later.goto('/play');
		await expect(later.locator('canvas')).toBeVisible({timeout: 30_000});
		await expect
			.poll(async () => (await submissionStep(later)).step, {
				message: 'the turn should be found revealed, by somebody else',
				timeout: 90_000,
			})
			.toBe('Revealed');
		expect(
			await missedRevealStep(later),
			'a reveal by fuzd is not a missed one',
		).toBe('Clear');

		// The board has its cells.
		const placementCost = BigInt(facts.placementCost);
		await expect
			.poll(
				async () => {
					for (const cellID of turn.cells) {
						const now = BigInt(await stakeOnCell(later, cellID));
						if (now !== (turn.before.get(cellID) ?? 0n) + placementCost)
							return false;
					}
					return true;
				},
				{
					message: 'every cell of the turn should be on the board',
					timeout: 30_000,
				},
			)
			.toBe(true);
	}

	test('reveals a turn whose page was closed before the reveal phase', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		test.setTimeout(300_000);
		await closedPageReveal(connectedPage, authoriseBrowser, 1);
	});

	test('reveals a turn of several chunks as one batch, in order', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		test.setTimeout(300_000);
		const chunk = await actionsPerReveal(connectedPage);
		await closedPageReveal(connectedPage, authoriseBrowser, chunk + 1);
	});

	test('falls back to this browser at half the reveal phase when fuzd is down', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		test.setTimeout(300_000);
		const page = connectedPage;
		const facts = await appFacts(page);
		const turn = await commitAScheduledTurn(page, authoriseBrowser, 1);
		expect((await currentPhase(page)).phase).not.toBe('reveal');

		// fuzd goes down AFTER scheduling the turn, the page staying open.
		freezeFuzd();
		try {
			// Unreachable is not a failure: the browser keeps to its fallback point
			// rather than racing a fuzd that may be sending the reveal right now.
			await expect(
				page.locator('[data-testid="reveal-schedule"]'),
			).toHaveAttribute('data-step', 'unreachable', {timeout: 90_000});
			await expect
				.poll(async () => (await submissionStep(page)).step, {
					message: 'this browser should reveal the turn itself',
					timeout: 120_000,
				})
				.toBe('Revealed');

			const onChain = await turnOnChain(
				facts.game,
				facts.identity,
				turn.cycleNumber,
			);
			expect(onChain.reveals).toHaveLength(1);
			const reveal = onChain.reveals[0];
			const transaction = await chain.getTransaction({
				hash: reveal.transactionHash as Hex,
			});
			expect(
				transaction.from.toLowerCase(),
				'revealed by the browser key',
			).toBe(facts.signer);
			// AT THE FALLBACK POINT, not at once: half the reveal phase in.
			const block = await chain.getBlock({blockNumber: reveal.blockNumber!});
			const into = Number(block.timestamp) - turn.schedule.revealDueAt;
			expect(into, 'revealed at half the phase').toBeGreaterThanOrEqual(
				turn.schedule.expiryDelta * 0.5,
			);
			expect(into).toBeLessThanOrEqual(turn.schedule.expiryDelta);
		} finally {
			thawFuzd();
		}
	});
});

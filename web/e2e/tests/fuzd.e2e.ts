import {type Hex} from 'viem';
import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';
import {
	actionsPerReveal,
	authoriseToPlay,
	currentPhase,
	stakeOnCell,
	submissionStep,
} from '../fixtures/game';
import {fuzdExecution, remoteAccountOf} from '../fixtures/fuzd';
import {
	appFacts,
	chain,
	commitAScheduledTurn,
	missedRevealStep,
	turnOnChain,
} from '../fixtures/fuzd-game';

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
 * In the `fuzd` project, which runs after every other suite with fuzd live (see
 * `FUZD_SUITE` in playwright.config.ts). The fallback with fuzd down is
 * `fuzd-fallback.e2e.ts`, in a project after this one.
 */

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
});

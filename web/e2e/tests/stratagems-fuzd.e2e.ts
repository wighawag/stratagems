import {type Hex} from 'viem';
import {test, expect, describe} from '../fixtures/test';
import {boardLoaded, cellOnBoard, gameStep} from '../fixtures/stratagems';
import {fuzdExecution, remoteAccountOf} from '../fixtures/fuzd';
import {
	appFacts,
	chain,
	commitAScheduledTurn,
	missedRevealStep,
	turnOnChain,
} from '../fixtures/stratagems-fuzd';

/**
 * A STRATAGEMS TURN REVEALED BY FUZD (`with/fuzd`, step 8, P10 of
 * work/plans/join-template-commit-reveal.md), end to end against a real chain
 * and the real fuzd CLI. The reference game's `fuzd.e2e.ts` for stratagems.
 *
 * The page is CLOSED before the reveal phase, and a new page opened after the
 * cycle has turned must find the turn `Revealed` (not `Missed`), the cells on
 * the board from the indexer, and the reveal sent by the player's REMOTE
 * account, which only fuzd holds the key of. A stratagems turn is at most 30
 * moves, under one chunk of 32, so the reference game's multi-chunk case has
 * no counterpart here.
 *
 * In the layer's `fuzd` stage (its name matches `fuzd.e2e.ts`), after every
 * other suite, with fuzd live; see `FUZD_SUITE` in playwright.config.ts.
 */
describe('A stratagems turn revealed by fuzd', () => {
	// Its own burner account, like every suite that sends transactions.
	test.use({walletAccountIndex: 7});

	test('reveals a turn whose page was closed before the reveal phase', async ({
		connectedPage,
	}) => {
		test.setTimeout(300_000);
		const page = connectedPage;
		const facts = await appFacts(page);
		const turn = await commitAScheduledTurn(page, 2);

		// CLOSED BEFORE THE REVEAL PHASE: nothing of this browser is left to
		// reveal it.
		expect(
			(await gameStep(page)).phase,
			'the page must close before the reveal phase',
		).not.toBe('reveal');
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
		expect(onChain.reveals, 'the turn revealed').toHaveLength(1);
		const reveal = onChain.reveals[0];
		expect(reveal.args.commitmentHash).toBe(onChain.made.args.commitmentHash);
		expect(BigInt(reveal.args.furtherActions ?? '0x1')).toBe(0n);

		// SENT BY THE REMOTE ACCOUNT, the one fuzd broadcast.
		const remote = await remoteAccountOf(facts.signer);
		expect(turn.schedule.remoteAccount.toLowerCase()).toBe(remote);
		expect(turn.schedule.account, 'fuzd keys a schedule by its signer').toBe(
			facts.signer,
		);
		const transaction = await chain.getTransaction({
			hash: reveal.transactionHash as Hex,
		});
		expect(
			transaction.from.toLowerCase(),
			'the reveal is sent by the remote account',
		).toBe(remote);
		expect(
			(await fuzdExecution(turn.schedule, 0))?.hash,
			'fuzd broadcast it',
		).toBe(reveal.transactionHash);

		// A NEW PAGE, after the cycle has turned: revealed, not missed.
		const later = await browserContext.newPage();
		await later.goto('/play');
		await expect(later.locator('canvas')).toBeVisible({timeout: 30_000});
		await expect
			.poll(async () => (await gameStep(later)).step, {
				message: 'the turn should be found revealed, by somebody else',
				timeout: 90_000,
			})
			.toBe('Revealed');
		expect(
			await missedRevealStep(later),
			'a reveal by fuzd is not a missed one',
		).toBe('Clear');

		// The board has the cells, as the indexer folded them: the player's.
		await boardLoaded(later);
		for (const move of turn.moves) {
			await expect
				.poll(
					async () => {
						const cell = await cellOnBoard(later, move.position);
						return (
							cell !== undefined &&
							cell.planned === undefined &&
							cell.color === move.color &&
							cell.life > 0 &&
							cell.owner === facts.identity
						);
					},
					{
						message: `the move on ${move.position} should be on the board`,
						timeout: 60_000,
					},
				)
				.toBe(true);
		}
	});
});

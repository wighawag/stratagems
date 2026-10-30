import {type Hex} from 'viem';
import {test, expect, describe} from '../fixtures/test';
import {gameStep} from '../fixtures/stratagems';
import {freezeFuzd, thawFuzd} from '../fixtures/fuzd';
import {
	appFacts,
	chain,
	commitAScheduledTurn,
	turnOnChain,
} from '../fixtures/stratagems-fuzd';

/**
 * THE FALLBACK (`with/fuzd`, P7, step 8 of
 * work/plans/join-template-commit-reveal.md): fuzd goes down AFTER scheduling a
 * stratagems turn, and the browser, still open, reveals it itself at half the
 * reveal phase, from its own key, rather than at once (fuzd may be sending it)
 * or never. The reference game's `fuzd-fallback.e2e.ts` for stratagems.
 *
 * In the layer's `fuzd-fallback` stage (its name matches), after every other
 * fuzd suite: it freezes fuzd, and nothing else may see that.
 */
describe('A scheduled stratagems reveal when fuzd is down', () => {
	// Its own burner account, like every suite that sends transactions.
	test.use({walletAccountIndex: 8});

	test('falls back to this browser at half the reveal phase when fuzd is down', async ({
		connectedPage,
	}) => {
		test.setTimeout(300_000);
		const page = connectedPage;
		const facts = await appFacts(page);
		const turn = await commitAScheduledTurn(page, 1);
		expect((await gameStep(page)).phase).not.toBe('reveal');

		// fuzd goes down AFTER scheduling the turn, the page staying open.
		freezeFuzd();
		try {
			// Unreachable is not a failure: the browser keeps to its fallback point
			// rather than racing a fuzd that may be sending the reveal right now.
			await expect(
				page.locator('[data-testid="reveal-schedule"]'),
			).toHaveAttribute('data-step', 'unreachable', {timeout: 90_000});
			await expect
				.poll(async () => (await gameStep(page)).step, {
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

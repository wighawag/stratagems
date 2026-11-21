import {
	test,
	expect,
	describe,
	drainSignerGas,
	refillSignerGas,
} from '../fixtures/test';
import {
	authoriseToPlay,
	clearAnyMissedReveal,
	planOnCanvas,
	submissionStep,
	stake,
} from '../fixtures/game';

/**
 * The path where a player loses a stake, in a real browser.
 *
 * Every other e2e test funds the signer first (`fundAppSenders`), so the whole
 * top-up remedy - the classification at the boundary, the HUD's offer, the
 * automatic resume - was covered only by unit tests. This is the one suite that
 * actually runs a move out of gas.
 *
 * It is worth the minutes it costs because of what the failure costs. A move is
 * signed by a local signer the player was never told about, holding only what
 * someone put in it; it can run dry between one cycle and the next. If the
 * failure is reported as a generic error, or the remedy is offered for
 * something a top-up cannot fix, or the submission does not pick itself back up
 * when the gas lands, the player finds out by losing their bond.
 *
 * Three claims, in the order they matter:
 *
 * 1. the move fails as an OUT-OF-GAS failure, named as such
 * 2. the remedy is offered, next to the failure, without being asked for
 * 3. gas arriving from ANYWHERE resumes the submission, all the way to Revealed
 */
describe('A move that runs out of gas', () => {
	// Its own burner account. The game keys one open commitment per player per
	// cycle, and this test deliberately fails a commit, so sharing an account
	// with another suite would have them fighting over the same commitment slot.
	test.use({walletAccountIndex: 3});

	test('is named, offers the remedy, and resumes when the gas lands', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		// A failed commit, a top-up, then a full submission to prove nothing was
		// lost.
		test.slow();
		const page = connectedPage;

		await authoriseToPlay(page, authoriseBrowser);
		await clearAnyMissedReveal(page);

		// Stake first, while there is still gas to do it with. This is the wallet's
		// money and the wallet's transaction (the sale credits `player` while
		// whoever sends it pays), so it is unaffected by what follows - but the
		// reserve has to exist before the commit, or the commit would fail for the
		// wrong reason and this test would pass on the wrong failure.
		//
		// It also FUNDS THE SIGNER, in the same transaction, which is exactly what
		// the drain below then takes away again. That ordering is deliberate: the
		// remedy this test is about has to work on a signer that was funded
		// properly and then ran dry, not on one that was never funded at all.
		const reserveBefore = BigInt((await submissionStep(page)).reserve ?? '0');
		await stake(page);
		await expect
			.poll(
				async () =>
					BigInt((await submissionStep(page)).reserve ?? '0') > reserveBefore,
				{message: 'the reserve should grow before playing', timeout: 60_000},
			)
			.toBe(true);

		// Now take the gas away. Everything up to here was setup; this is the
		// condition under test.
		await drainSignerGas(page);

		// Enough of the play phase left to fail, be told, be topped up, and still
		// commit inside the same cycle - an uncommitted plan expires when the cycle
		// turns over, and this test is about recovering the submission, not losing
		// it.
		await planOnCanvas(page, {x: -60, y: 40}, 12);

		// Try to commit. The submission also commits by itself as the phase closes,
		// so the button is pressed only if it is still live: waiting for it would
		// race the auto-commit and then wait forever for a button that has done its
		// job.
		const commit = page.getByRole('button', {name: /commit now/i});
		if (await commit.isEnabled().catch(() => false)) {
			await commit.click().catch(() => {});
		}

		// --- 1. the failure is named ---------------------------------------
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'a commit with no gas should fail',
				timeout: 60_000,
			})
			.toBe('Error');

		// The message the player is actually shown. It names the GAS, not the
		// transaction and not "this account": the account is a signer they were
		// never told about, so anything vaguer sends them to look at a wallet
		// balance that is perfectly healthy.
		await expect(
			page.getByText(/no gas left to play with/i),
			'the failure should be named as gas, not reported generically',
		).toBeVisible({timeout: 30_000});

		// --- 2. the remedy is offered --------------------------------------
		await expect(
			page.getByRole('button', {name: /top up and carry on/i}),
			'the one failure with a remedy should offer it, unprompted',
		).toBeVisible();

		// Nothing has been spent putting this right on the player's behalf: the
		// bond is still unbonded and the submission is still theirs to abandon.
		expect(
			(await submissionStep(page)).planned,
			'the plan should survive the failure, ready to be retried',
		).toBe(1);

		// --- 3. gas arriving resumes the submission ------------------------
		// From OUTSIDE the app, not by pressing its own top-up button: the submission
		// watches the signer's balance rather than the flow, so that a faucet, a
		// transfer by hand or someone else paying all work. Pressing the button
		// would only prove the button works.
		await refillSignerGas(page);

		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the submission should retry itself once the gas arrives',
				timeout: 60_000,
			})
			.toBe('Committed');

		// The offer goes away with the problem, rather than lingering as an alarm
		// about something already fixed.
		await expect(
			page.getByRole('button', {name: /top up and carry on/i}),
			'the remedy should stop being offered once it has been taken',
		).toBeHidden({timeout: 30_000});

		// And the submission finishes on its own. This is the claim that matters
		// most: a player who tops up does not lose the stake they had already
		// committed. A reveal is a second transaction from the same empty signer, so
		// a remedy that only got as far as the commit would still cost them the bond.
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the reveal should follow, so the stake is not lost',
				timeout: 120_000,
			})
			.toBe('Revealed');
	});
});

import {test, expect, describe} from '../fixtures/test';
import {
	authoriseToPlay,
	cellOnBoard,
	gameStep,
	giveGems,
	planMoves,
	stake,
} from '../fixtures/stratagems';

/**
 * ONE CYCLE OF STRATAGEMS, end to end against a real chain (step 6b of
 * work/plans/join-template-commit-reveal.md): stake, plan two moves on the
 * canvas, commit, reveal, and the board shows the cells, read back from the
 * etherfold indexer. The reference game's `game.e2e.ts` for stratagems.
 *
 * Each step is asserted on its own so a failure names the phase that broke.
 */
describe('Stratagems: one cycle', () => {
	// one open commitment per player per cycle: this file takes its own account
	test.use({walletAccountIndex: 0});

	test('stakes, plans two moves, commits, reveals, and the board shows them', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		// a commit phase, a reveal phase, and the indexer catching up
		test.slow();
		const page = connectedPage;

		await giveGems(page);

		const reserveBefore = BigInt((await gameStep(page)).reserve ?? '0');
		// The setup gate asks for the stake first (sign-in, stake, authorise). On
		// an account that already holds a reserve from an earlier run it does not
		// ask, and the HUD's "Add stake" goes through the same rail.
		await stake(page);
		await expect
			.poll(
				async () => BigInt((await gameStep(page)).reserve ?? '0') > reserveBefore,
				{message: 'the reserve should grow', timeout: 60_000},
			)
			.toBe(true);
		await authoriseToPlay(page, authoriseBrowser);

		await planMoves(page, 2);
		const planned = await gameStep(page);
		expect(planned.step).toBe('Planning');
		const moves = planned.moves;

		// the plan is drawn before anything is on chain
		for (const move of moves) {
			expect((await cellOnBoard(page, move.position))?.planned).toBe(move.color);
		}

		const commit = page.getByRole('button', {name: /commit now/i});
		if (await commit.isEnabled().catch(() => false)) {
			await commit.click().catch(() => {});
		}
		await expect
			.poll(async () => (await gameStep(page)).step, {
				message: 'the commitment should reach the chain',
				timeout: 90_000,
			})
			.toBe('Committed');

		await expect
			.poll(async () => (await gameStep(page)).step, {
				message: 'the submission should reveal itself in the reveal phase',
				timeout: 120_000,
			})
			.toBe('Revealed');

		// Once the cycle is over the board releases it, and each cell is what the
		// indexer folded from the reveal: the player's colour, alive, theirs.
		const account = planned.account?.toLowerCase();
		for (const move of moves) {
			await expect
				.poll(
					async () => {
						const cell = await cellOnBoard(page, move.position);
						return (
							cell !== undefined &&
							cell.planned === undefined &&
							cell.color === move.color &&
							cell.life > 0 &&
							cell.owner === account
						);
					},
					{
						message: `the revealed move on ${move.position} should be on the board, from the indexer`,
						timeout: 90_000,
					},
				)
				.toBe(true);
		}
	});
});

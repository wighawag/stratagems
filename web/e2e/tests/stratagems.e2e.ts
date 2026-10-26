import {test, expect, describe} from '../fixtures/test';
import {
	cellOnBoard,
	gameStep,
	giveGems,
	onChain,
	planMoves,
	senders,
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
		isDelegateRegistered,
	}) => {
		// a commit phase, a reveal phase, and the indexer catching up
		test.slow();
		const page = connectedPage;

		await giveGems(page);

		const reserveBefore = BigInt((await gameStep(page)).reserve ?? '0');
		const {account, signer, stipend} = await senders(page);
		expect(
			stipend,
			'the local chain declares a gas price to size a stipend',
		).toBeGreaterThan(0n);
		const registeredBefore = await isDelegateRegistered(page);
		const accountBefore = await onChain(account);
		const signerBefore = await onChain(signer);

		// The setup gate asks for the stake first (sign-in, stake, authorise). On
		// an account that already holds a reserve from an earlier run it does not
		// ask, and the HUD's "Add stake" goes through the same rail.
		await stake(page);
		await expect
			.poll(
				async () =>
					BigInt((await gameStep(page)).reserve ?? '0') > reserveBefore,
				{message: 'the reserve should grow', timeout: 60_000},
			)
			.toBe(true);

		// ONE WALLET TRANSACTION stakes AND lets this browser play: the stake
		// forwarded the stipend to the key (`addToReserveAndFund`), which
		// registered itself out of it. Nothing asks to authorise, and the account
		// sent exactly one transaction.
		if (!registeredBefore) {
			await expect
				.poll(() => isDelegateRegistered(page), {
					message: 'the key should register itself out of the stipend',
					timeout: 60_000,
				})
				.toBe(true);
			expect(
				(await onChain(account)).sent - accountBefore.sent,
				'staking should be one transaction from the wallet',
			).toBe(1);
			expect(
				(await onChain(signer)).balance - signerBefore.balance,
				'the key should have received the stipend (less its registration)',
			).toBeGreaterThan(stipend / 2n);
		}
		await expect(
			page.getByRole('button', {name: /authorise and carry on/i}),
		).toHaveCount(0);

		await planMoves(page, 2);
		const planned = await gameStep(page);
		expect(planned.step).toBe('Planning');
		const moves = planned.moves;

		// the plan is drawn before anything is on chain
		for (const move of moves) {
			expect((await cellOnBoard(page, move.position))?.planned).toBe(
				move.color,
			);
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
		const owner = account.toLowerCase();
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
							cell.owner === owner
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

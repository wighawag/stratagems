import {test, expect, describe} from '../fixtures/test';
import {
	cellOf,
	cellOnBoard,
	cellPanel,
	clickCell,
	gameStep,
	gems,
	getTestGems,
	onChain,
	planMoves,
	positionOf,
	rivalCommits,
	walletGems,
	senders,
	stake,
} from '../fixtures/stratagems';

/**
 * STRATAGEMS, end to end against a real chain (steps 6b and 6c of
 * work/plans/join-template-commit-reveal.md): test gems from the HUD, the stake,
 * a faction, two moves planned on the canvas, committed and revealed, the board
 * read back from the etherfold indexer, a rival's cell refused with its reason,
 * and then, once one of the player's cells has grown to full life, its removal
 * through the land menu. The reference game's `game.e2e.ts` for stratagems.
 *
 * Each step is asserted on its own so a failure names the phase that broke.
 */
describe('Stratagems', () => {
	// one open commitment per player per cycle: this file takes its own account
	test.use({walletAccountIndex: 0});

	/** The rival's cell: away from the middle, where the player's land. */
	const RIVAL_CELL = {x: -5, y: -5};

	test('gets test gems, stakes, picks a faction, plays a cycle, is told why a rival cell is refused, and removes a full-life cell', async ({
		connectedPage,
		isDelegateRegistered,
	}) => {
		// ONE TEST, because every test gets an account of its own: a cycle to
		// place, five for a placed cell to grow to full life, a cycle to remove
		// it, and the indexer catching up after each.
		test.setTimeout(12 * 60_000);
		const page = connectedPage;

		// GEMS FROM THE HUD (P2 of 6c): the deployment's distributor, from the
		// wallet, until the wallet holds a stake.
		const presses = await getTestGems(page);
		if (presses === 0) {
			test.info().annotations.push({
				type: 'not measured',
				description: 'the wallet already held a stake: test gems not pressed',
			});
		}

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
		// Only a key not yet registered is sent a stipend (the rail's
		// `stipendFor`), so a retry on the same chain, where the first attempt
		// already registered it, cannot measure this and says so.
		if (registeredBefore) {
			test.info().annotations.push({
				type: 'not measured',
				description:
					'the key was already registered: one-transaction stake not asserted',
			});
		} else {
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

		// A FACTION (P5 of 6c): not the default one, so the colour is the pick's.
		const defaultFaction = Number((BigInt(account) % 5n) + 1n);
		const picked = (defaultFaction % 5) + 1;
		await page.locator(`[data-testid="faction-${picked}"]`).click();
		await expect(
			page.locator(`[data-testid="faction-${picked}"]`),
		).toHaveAttribute('aria-pressed', 'true');

		await planMoves(page, 2);
		const planned = await gameStep(page);
		expect(planned.step).toBe('Planning');
		const moves = planned.moves;
		for (const move of moves) {
			expect(move.color, 'a planned move takes the faction picked').toBe(
				picked,
			);
			// the plan is drawn before anything is on chain
			expect((await cellOnBoard(page, move.position))?.planned).toBe(picked);
		}

		// A RIVAL commits in the same cycle, on a cell of its own.
		const rival = await rivalCommits(page, {...RIVAL_CELL, color: 2});

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
			.poll(async () => (await gameStep(page)).phase, {
				message: 'the reveal phase should open',
				timeout: 90_000,
			})
			.toBe('reveal');
		await rival.reveal();

		await expect
			.poll(async () => (await gameStep(page)).step, {
				message: 'the submission should reveal itself in the reveal phase',
				timeout: 120_000,
			})
			.toBe('Revealed');

		// Once the cycle is over the board releases it, and each cell is what the
		// indexer folded from the reveal: the faction's colour, alive, theirs.
		const owner = account.toLowerCase();
		for (const move of moves) {
			await expect
				.poll(
					async () => {
						const cell = await cellOnBoard(page, move.position);
						return (
							cell !== undefined &&
							cell.planned === undefined &&
							cell.color === picked &&
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

		// A REFUSED CLICK SAYS WHY (P6 of 6c): the rival's living cell is theirs
		// this cycle, so a click plans nothing and the cell panel says so.
		const rivalPosition = positionOf(RIVAL_CELL).toString();
		await expect
			.poll(async () => (await cellOnBoard(page, rivalPosition))?.owner, {
				message: "the rival's cell should be on the board",
				timeout: 60_000,
			})
			.toBe(rival.player);
		const before = (await gameStep(page)).planned;
		await clickCell(page, RIVAL_CELL);
		await expect(cellPanel(page)).toContainText(
			`Cell ${RIVAL_CELL.x},${RIVAL_CELL.y}`,
		);
		await expect(
			cellPanel(page).locator('[data-testid="cell-refused"]'),
		).toContainText("Another player's living cell");
		expect((await gameStep(page)).planned).toBe(before);

		// THE LAND MENU (P6 of 6c): once one of the cells just placed has grown
		// to full life (placed at 2, one a cycle, so five cycles on), a click on
		// it offers its removal, which returns its gem to the wallet.
		const maxLife = (await page.evaluate(
			'globalThis.context.game.config.maxLife',
		)) as number;

		// the player's own cells, as the board shows them
		const ownCells = async (): Promise<{position: string; life: number}[]> =>
			page.evaluate(`(() => {
				let view;
				globalThis.context.viewState.subscribe((v) => (view = v))();
				if (view.step !== 'Loaded') return [];
				return [...view.cells.values()]
					.filter((c) => c.owner === '${owner}' && c.life > 0 && c.planned === undefined)
					.map((c) => ({position: c.position.toString(), life: c.life}));
			})()`) as Promise<{position: string; life: number}[]>;

		await expect
			.poll(async () => (await ownCells()).some((c) => c.life === maxLife), {
				message: 'one of the cells placed should grow to full life',
				timeout: 6 * 60_000,
				intervals: [5_000],
			})
			.toBe(true);
		const target = (await ownCells()).find((c) => c.life === maxLife)!;

		// in a play phase with time left, the land menu: click, then remove
		await expect
			.poll(
				async () => {
					const step = await gameStep(page);
					return step.phase === 'play' && step.timeLeft > 15;
				},
				{message: 'a play phase with time left', timeout: 120_000},
			)
			.toBe(true);
		await clickCell(page, cellOf(target.position));
		const remove = cellPanel(page).locator('[data-testid="remove-cell"]');
		await expect(
			remove,
			'the land menu should offer the removal',
		).toBeVisible();
		await remove.click();
		expect((await gameStep(page)).moves).toEqual([
			{position: target.position, color: 0},
		]);

		const {perMove} = await gems(page);
		const walletBefore = await walletGems(page, account);
		await page.getByRole('button', {name: /commit now/i}).click();
		await expect
			.poll(async () => (await gameStep(page)).step, {
				message: 'the removal should be committed',
				timeout: 90_000,
			})
			.toBe('Committed');
		await expect
			.poll(async () => (await gameStep(page)).step, {
				message: 'the removal should reveal itself',
				timeout: 120_000,
			})
			.toBe('Revealed');

		// the cell is gone from the board, and its gem is back in the wallet
		await expect
			.poll(
				async () => {
					const cell = await cellOnBoard(page, target.position);
					return cell === undefined || cell.life === 0;
				},
				{message: 'the removed cell should leave the board', timeout: 90_000},
			)
			.toBe(true);
		expect(
			await walletGems(page, account),
			"the removed cell's gem should come back to the wallet",
		).toBe(walletBefore + perMove);
	});
});

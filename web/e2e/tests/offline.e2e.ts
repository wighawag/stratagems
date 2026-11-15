import {test, expect, describe, chooseTheWorld} from '../fixtures/test';

/**
 * A WHOLE ROUND AGAINST A CHAIN IN THIS TAB.
 *
 * This is the only test in the tree that exercises the offline world end to
 * end, and it is the only one that can: everything it covers happens in a
 * BROWSER and nowhere else - the chain boots in a worker, `@rocketh/web` runs
 * this game's own deploy scripts against it, a generated wallet is announced
 * over EIP-6963, the app signs in over that wallet to derive the key it plays
 * with, and the cycle is pushed on by a transaction because the deployment
 * declares the MANUAL policy. `check` and `test:unit` prove the text compiles
 * and the units hold; they have never been able to say anything about this.
 *
 * IT CLAIMS NO WALLET ACCOUNT FROM THE SHARED POOL, and that is a fact about
 * this suite rather than an oversight. It sends plenty of transactions - eight
 * per round now that there are three players - and every one of them is on a
 * chain that exists only inside this test's own page, from keys that world
 * holds, on a chain id minted for it. There is no shared nonce to race for,
 * because there is nothing shared.
 *
 * AND IT IS A FAR STRONGER GATE THAN IT WAS, for free, because the world enrols
 * THREE waited-for members and plays two of them. The reveal phase cannot open
 * until every one of them has committed and the next cycle cannot start until
 * every commitment has been opened, so the two assertions at the bottom - a
 * reveal happening at all, and cycle 3 arriving - now say that the other two
 * players ACTED. Before there was anybody else to wait for, they said only
 * that `advanceCycle` was called.
 *
 * `test/e2e-account-claims.test.ts` decides which files need one by SEARCHING
 * THE SOURCE for the fixtures that connect a shared wallet, so a comment naming
 * those fixtures is indistinguishable from using them - this paragraph tripped
 * it and the suite failed for the collision it was explaining it could not
 * have. Describe them, do not spell them.
 *
 * IT NOW ALSO SAYS WHOSE CHROME IS ABOVE THE BOARD, and that is a browser
 * question too. This surface declares a chrome of its own (`routes/offline/+page.ts`
 * and `$lib/offline-chrome`), so the app's account, its connection state and its
 * credits must be ABSENT here - a world generated the wallet, so showing that
 * address where the app shows the player's own says "your account changed" to
 * anyone who played online first. `check` sees a declaration and cannot see what
 * reached the screen; only a rendered page can say that the app's navbar is not
 * there AND that exactly one navbar is, which is what keeps the board below the
 * chrome rather than under it.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT is timing. The measurements are in the
 * plan on the `work` branch; a test that pinned them would fail on a busy
 * machine and say nothing about the game. The timeouts below are unchanged from
 * when one player played alone, which is the honest thing to check after adding
 * two more: a three-player round is a small multiple of a one-player round and
 * not a different order of magnitude, so widening them would have hidden a slow
 * loop rather than accommodated an inherently slower game. They are unchanged
 * again now that a LOBBY chooses the table, for the same reason - what was
 * added in front of the boot is a press, and what was taken out of it was a
 * dialog.
 *
 * AND IT NO LONGER PRESSES THE AUTHORISE BUTTON, which is a deliberate loss of
 * coverage and is recorded here rather than left to be noticed. That press used
 * to be the only UNCONDITIONAL drive of the top-up modal in the whole suite -
 * choose a payer, confirm, watch the registration land - and the world now does
 * the registration itself, through the same two functions that modal calls
 * (`registrationRequest` and `submitRegistration`), because offline the
 * question has one answer. So the CONTRACT half of the delegation path is still
 * exercised in a browser on every run, and asserted below off the chain rather
 * than off a button disappearing; the modal's own half is left to its unit
 * tests and to the suites that still meet that button when the shared chain has
 * already staked their account.
 */
describe('Playing offline', () => {
	test('boots a world in the tab and plays a whole cycle in it', async ({
		page,
	}) => {
		await page.goto('/offline/');

		// THE LOBBY COMES FIRST, AND NOTHING HAS BOOTED YET. Membership is baked
		// into a world by provisioning, so how many seats there are has to be
		// settled before a chain exists - which is why this press is not a gate in
		// front of the game but the one decision the game needs.
		await expect(page.getByText('How many at the table?')).toBeVisible({
			timeout: 60_000,
		});
		await chooseTheWorld(page);
		await page.getByTestId('sit-down').click();

		// The world is up: this strip is rendered only once the chain, the deploy
		// and the connection have all happened. It is now this surface's own CHROME
		// rather than the route's first element, which changes where it comes from
		// and not what it means.
		await expect(
			page.getByText('Everything below runs against a chain inside this tab'),
		).toBeVisible({timeout: 120_000});

		// THE APP'S CHROME IS NOT HERE, AND THAT IS THE POINT OF THE SURFACE.
		//
		// This world generated its own wallet, so the account the app's navbar shows
		// is not the player's; there is nothing to connect to, so a connection state
		// has one possible value; and the world invented the money, so credits are a
		// number about nothing. A player who played online first would read the same
		// position on screen as "my account changed".
		//
		// ASSERTED AS ABSENCE, because that is the rule rather than a shortcut: a
		// control whose only truthful value here is "not applicable" is ABSENT, not
		// disabled and not showing a placeholder (ADR-0004 on the `work` branch, and
		// jolly-roger's ADR-0009 for the mechanism).
		//
		// EACH ONE NAMES A DIFFERENT SOURCE, deliberately, because they can fail
		// separately. `wallet-status` is the navbar's account block, `[data-connected]`
		// is the connection predicate the whole e2e suite reads, and `signer-credits`
		// is the credits indicator. A chrome that dropped one and kept another would
		// be the half-done version, which is the state worth failing on.
		await expect(page.getByTestId('wallet-status')).toHaveCount(0);
		await expect(page.locator('[data-connected]')).toHaveCount(0);
		await expect(page.getByTestId('signer-credits')).toHaveCount(0);
		await expect(page.getByRole('button', {name: /^connect$/i})).toHaveCount(0);

		// AND THERE IS STILL EXACTLY ONE NAVBAR, which is the other half of the same
		// assertion and the one that keeps the geometry honest. A replacement navbar
		// is still a navbar: the shell reserves `var(--navbar-height)` for whatever
		// is in that slot, so zero of them leaves a blank strip where the chrome
		// should be, and two would put the app's account back on screen beside the
		// world's. `layout-shell.e2e.ts` measures this attribute for the same reason.
		await expect(page.locator('[data-app-navbar]')).toHaveCount(1);
		await expect(page.getByTestId('offline-world-navbar')).toBeVisible();

		// AND THE BOARD IS NOT GATED ON ANYTHING. There is nothing left to ask
		// for: the world gave every seat a stake and gas during provisioning, and
		// it registered the key this browser plays with in the step that derived
		// it. Asserted as an absence AND as a fact on the chain below, because an
		// absent button is also what a world that never got that far looks like.
		await expect(
			page.getByRole('button', {name: /authorise and carry on/i}),
		).toHaveCount(0, {timeout: 60_000});

		// THE CHAIN SAYS THIS BROWSER MAY PLAY. `delegationStatus` is read for the
		// (account, signer) pair, so `allowed` is the answer about THIS browser's
		// key rather than about whichever delegate happens to be listed first.
		// Read through the world's own handle rather than the console one, which
		// two contexts write to and the last one wins.
		await expect
			.poll(
				() =>
					page.evaluate(`(() => {
					const read = (store) => {
						let value;
						const stop = store.subscribe((v) => (value = v));
						if (typeof stop === 'function') stop();
						return value;
					};
					const world = globalThis.offlineWorld;
					if (!world) return 'no world';
					const delegation = read(world.context.delegation);
					if (delegation.step !== 'Loaded') return delegation.step;
					return delegation.allowed === true ? 'allowed' : 'refused';
				})()`),
				{timeout: 60_000},
			)
			.toBe('allowed');

		// AND IT SAID SO. A step taken for the player still has to be a step they
		// were told about: online this one is a transaction they sign and pay for,
		// and meeting it for the first time there, unexplained, in front of a board
		// they have already decided to play, is the experience this sentence exists
		// to prevent.
		await expect(
			page.getByText('one transaction you sign and pay for'),
		).toBeVisible();

		// The membership this world was provisioned with, on screen, because it
		// cannot be changed without starting a new one. In this world's own navbar
		// now, next to the way out, which is the press that changes it.
		await expect(page.getByText('3 seats at this table')).toBeVisible();
		await expect(page.getByTestId('leave-the-table')).toBeVisible();

		// A manual cycle starts at 2 and moves for no reason except a transaction.
		await expect(page.getByText('cycle 2')).toBeVisible({timeout: 30_000});

		// Plan one placement, through the canvas, because the click path is where
		// the bugs are (see game.e2e.ts).
		const canvas = page.locator('canvas');
		await expect(canvas).toBeVisible({timeout: 30_000});
		const box = await canvas.boundingBox();
		if (!box) throw new Error('the canvas has no layout box');
		await page.mouse.click(
			box.x + box.width / 2 + 40,
			box.y + box.height / 2 + 30,
		);

		await page.getByRole('button', {name: /commit now/i}).click();

		// THE WHOLE CLAIM IN TWO ASSERTIONS. The reveal only happens if somebody
		// called `advanceCycle` after the commit - a reveal sent in the commit
		// phase is refused with `InCommitmentPhase` - and cycle 3 only happens if
		// somebody called it again after the reveal. Nothing in `web/src` did
		// either until `game/core/advance.ts`.
		await expect(
			page.getByText('Revealed. Your placements are on the board.'),
		).toBeVisible({timeout: 60_000});
		await expect(page.getByText('cycle 3')).toBeVisible({timeout: 60_000});

		// AND THE OTHER TWO PUT SOMETHING ON THE BOARD, which no count of
		// transactions can tell you. A player that committed and revealed an empty
		// turn would satisfy every assertion above and leave the human looking at a
		// board with one cell on it.
		//
		// The chain is minted for this page, so the board started EMPTY and an
		// absolute count is meaningful here - which it is not in the suites that run
		// against the shared local chain (see the stake fixture on why those assert
		// on a change). The claimant count rather than the stake, because a
		// placement is free on one branch of this template and a stake assertion
		// would be trivially true there.
		//
		// SUMMED OVER THE BOARD RATHER THAN COUNTING CELLS, which is the difference
		// between an assertion and a coin toss: three players placing one cell each
		// is three claimants however many of them chose the same cell, and a played
		// turn is a deterministic function of the cycle, so a collision would be a
		// permanent failure rather than a flake.
		//
		// A FLOOR AND NOT AN EQUALITY, because on a deployment where a placement is
		// free this quantity is not what its name says. `_place` counts a claimant
		// when the player's stake on the cell was zero, so at a zero placement cost
		// it is still zero afterwards and every placement counts again - measured at
		// nine for three rounds on that branch against seven here. That is a defect
		// in the contract and not in this test; it is recorded on the `work` branch
		// and is deliberately not fixed from here.
		await expect
			.poll(
				() =>
					page.evaluate(`(() => {
					let view;
					const stop = globalThis.context.viewState.subscribe((v) => (view = v));
					if (typeof stop === 'function') stop();
					if (view.step !== 'Loaded') return -1;
					return [...view.cells.values()].reduce((n, c) => n + c.numClaimants, 0);
				})()`),
				{timeout: 30_000},
			)
			.toBeGreaterThanOrEqual(3);
	});
});

import {test, expect, describe} from '../fixtures/test';
import {
	actionsPerReveal,
	authoriseToPlay,
	clearAnyMissedReveal,
	clickCanvas,
	forgetSubmissionAndReload,
	planManyOnCanvas,
	plannedCellIDs,
	planOnCanvas,
	submissionStep,
	stake,
	stakeOnCell,
} from '../fixtures/game';

/**
 * The commit-reveal submission, end to end against a real chain.
 *
 * Both suites here are driven through the UI (a click on the canvas, not a call
 * into a store): the click path is where the bugs were. A click that lands on
 * the wrong cell because the canvas is inset by the app shell looks like
 * nothing at all until you measure it.
 *
 * The helpers read state out of the app rather than off the screen, so an
 * assertion fails on what the game believes rather than on how it rendered.
 */

/**
 * A placement is planned locally, committed as a hash, and only becomes part of
 * the board when it is revealed in the next phase. Each step is asserted
 * separately so a failure names the phase that broke rather than landing on a
 * later assertion.
 */
describe('Commit-reveal submission', () => {
	// The game keys one open commitment per player per cycle, so this file takes
	// its own burner account (the contracts suite uses index 1).
	test.use({walletAccountIndex: 0});

	test('plans a placement, commits it, and reveals it onto the board', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		// A full submission has to wait out a commit phase and a reveal phase.
		test.slow();
		const page = connectedPage;

		// WHO OWNS and WHO SENDS are different addresses, and that is the whole
		// design. A submission is two transactions every cycle, so sending them from
		// the wallet would prompt twice a cycle forever, and an account
		// authenticated by email has no wallet provider to prompt with at all -
		// hence the signer. But the signer is a key this browser made, holding
		// nothing and losable with the site data, so it must not be the player:
		// the ACCOUNT owns the reserve and the cells, and the signer merely acts
		// for it, authorised on chain.
		const senders = await page.evaluate(() => {
			const context = (globalThis as unknown as {context: any}).context;
			const read = <T>(store: {
				subscribe: (run: (v: T) => void) => unknown;
			}) => {
				let value!: T;
				const stop = store.subscribe((v: T) => (value = v)) as
					(() => void) | {unsubscribe(): void};
				if (typeof stop === 'function') stop();
				else stop.unsubscribe();
				return value;
			};
			const signer = read<any>(context.signerExecutor);
			return {
				account: read<string | undefined>(context.account),
				signer: signer.status === 'ready' ? signer.address : undefined,
				identity: read<string | undefined>(context.game.identity),
				hasLocalSigner: context.hasLocalSigner,
			};
		});
		expect(senders.hasLocalSigner, 'the app signs in, so a signer exists').toBe(
			true,
		);
		expect(senders.signer, 'the signer should be ready').toBeTruthy();
		expect(
			senders.signer?.toLowerCase(),
			'the sender must not be the account, or there is nothing to prove',
		).not.toBe(senders.account?.toLowerCase());
		// The claim that matters, and the one this template got wrong: the game's
		// identity is the ACCOUNT. If it were the signer, clearing site data would
		// destroy the player along with their staked reserve, unrecoverably.
		expect(
			senders.identity?.toLowerCase(),
			'the game must play as the account, not as the key that signs',
		).toBe(senders.account?.toLowerCase());

		// Let this browser play as the account. The signer SENDS the moves; the
		// account OWNS the reserve and the cells, and a signer that is not its
		// registered delegate cannot commit at all.
		await authoriseToPlay(page, authoriseBrowser);

		await clearAnyMissedReveal(page);

		// Something must be at stake, or there is no reason to reveal. The
		// template gates on a token reserve bonded at commit time.
		//
		// Asserted against the app's own store rather than the HUD text: "Reserve"
		// also appears in the transaction toast for `addToReserve`, so a text
		// locator matches two different things and trips strict mode.
		//
		// An INCREASE, not "non-zero": the e2e chain is shared and reused, so this
		// account may already hold a reserve from an earlier run, and asserting
		// non-zero would pass without the top-up having done anything.
		const reserveBefore = BigInt((await submissionStep(page)).reserve ?? '0');
		// The label depends on whether there is anything staked yet: with an empty
		// reserve the HUD replaces the planning controls with the setup gate,
		// because planning a turn that cannot be committed only fails later. Both
		// labels go through the acquisition rail, which is ONE transaction that
		// stakes and funds the play key, so on a fresh account this is also what
		// authorises the browser.
		await stake(page);
		await expect
			.poll(
				async () =>
					BigInt((await submissionStep(page)).reserve ?? '0') > reserveBefore,
				{
					message: 'the reserve should grow before playing',
					timeout: 60_000,
				},
			)
			.toBe(true);

		// Plan a placement by clicking the canvas. Offset from the middle so the
		// two suites in this file aim at different cells.
		await planOnCanvas(page, {x: 40, y: 30});

		const planned = await submissionStep(page);
		expect(
			planned.planned,
			'the planned cell should be drawn before it is on chain',
		).toBe(1);
		const cellID = planned.cellID;
		if (!cellID) throw new Error('the submission has no planned cell');

		// What the cell already holds, from this run or any earlier one.
		const stakeBefore = BigInt(await stakeOnCell(page, cellID));

		// Commit. Pressing the button if it is still live keeps the test short, but
		// the submission commits by itself as the phase closes, so this deliberately
		// does not REQUIRE the button: waiting for it to be enabled would race the
		// auto-commit and then wait forever for a button that has done its job and
		// gone quiet.
		const commit = page.getByRole('button', {name: /commit now/i});
		if (await commit.isEnabled().catch(() => false)) {
			await commit.click().catch(() => {});
		}

		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the commitment should reach the chain',
				timeout: 90_000,
			})
			.toBe('Committed');

		// Nothing of the placement is on the board yet: that is the whole point of
		// committing. Only the player's own client knows what they chose.
		expect(
			BigInt(await stakeOnCell(page, cellID)),
			'a commitment must not change the board',
		).toBe(stakeBefore);

		// The reveal is driven by the submission when the phase turns over: a missed
		// reveal forfeits the bond, so it is never left to the player to notice.
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the submission should reveal itself in the reveal phase',
				timeout: 120_000,
			})
			.toBe('Revealed');

		// Only once revealed does the placement become part of the board.
		await expect
			.poll(
				async () => (await stakeOnCell(page, cellID)) !== `${stakeBefore}`,
				{
					message: 'the revealed placement should reach the board',
					timeout: 30_000,
				},
			)
			.toBe(true);

		// Read the cost from the deployment rather than hard-coding it, so changing
		// `placementCost` in the deploy script cannot leave this quietly asserting
		// the old number.
		const placementCost = BigInt(
			await page.evaluate(() =>
				(
					globalThis as unknown as {context: any}
				).context.game.config.placementCost.toString(),
			),
		);
		expect(
			BigInt(await stakeOnCell(page, cellID)),
			'the reveal should add exactly one placement of stake',
		).toBe(stakeBefore + placementCost);

		expect(
			(await submissionStep(page)).planned,
			'the planned marker should have cleared',
		).toBe(0);
	});
});

/**
 * A TURN BIGGER THAN A TRANSACTION, end to end.
 *
 * Every chain has a gas ceiling, so a turn longer than the deployment's
 * `actionsPerReveal` is committed as the head of a hash chain and opened in
 * several transactions, in order, all of them inside one reveal phase.
 *
 * IT IS HERE AND NOT ONLY IN UNIT TESTS because every part of it that can go
 * wrong lives in a different layer: the client has to cut the turn the way the
 * contract will accept, the contract has to keep the commitment open between
 * chunks, the cycle must not close on a half-revealed turn, and the HUD has to
 * say what is happening while the board fills in a few cells at a time. A
 * progress flow that never renders passes every other gate in this repo -
 * nothing type-checks this directory at all.
 */
describe('A turn bigger than one transaction', () => {
	// Its own burner account, like every suite that sends transactions: files run
	// in parallel workers and two of them sending from one account race for a
	// nonce. `test/e2e-account-claims.test.ts` enforces it.
	test.use({walletAccountIndex: 6});

	test('commits a long turn as a chain and opens it across several reveals', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		// A full submission waits out a commit phase and a reveal phase, and this
		// one plans several cells inside the play phase first.
		test.slow();
		const page = connectedPage;

		await authoriseToPlay(page, authoriseBrowser);
		await clearAnyMissedReveal(page);
		await stake(page);
		await expect
			.poll(async () => (await submissionStep(page)).reserve !== '0', {
				message: 'a reserve to bond from',
				timeout: 60_000,
			})
			.toBe(true);

		// ONE MORE THAN A CHUNK, read off the deployment. Exactly one more, because
		// every extra click is budget out of a play phase this whole test has to
		// fit inside, and two chunks is all it takes to make the reveal a sequence.
		const chunk = await actionsPerReveal(page);
		expect(chunk, 'the deployment should declare a chunk size').toBeGreaterThan(
			0,
		);
		await planManyOnCanvas(page, chunk + 1);

		const cells = await plannedCellIDs(page);
		expect(cells.length).toBe(chunk + 1);
		const before = new Map<string, bigint>();
		for (const cellID of cells) {
			// The e2e chain is shared and reused, so every assertion is about the
			// CHANGE rather than an absolute figure.
			before.set(cellID, BigInt(await stakeOnCell(page, cellID)));
		}

		const commit = page.getByRole('button', {name: /commit now/i});
		if (await commit.isEnabled().catch(() => false)) {
			await commit.click().catch(() => {});
		}
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the whole turn should be committed as ONE hash',
				timeout: 90_000,
			})
			.toBe('Committed');

		// A turn spanning two transactions is still one commitment: nothing about
		// the board changes until it is opened.
		for (const cellID of cells) {
			expect(
				BigInt(await stakeOnCell(page, cellID)),
				'a commitment must not change the board',
			).toBe(before.get(cellID));
		}

		// THE COUNT THE PLAYER IS SHOWN, caught while the reveal is still running.
		// Polled for rather than waited on: the two transactions land quickly on a
		// local node, so this is a race the assertion has to be allowed to lose
		// without failing the test on it - what must not happen is the submission
		// reporting a count that says there is only one.
		let sawATotalOf = 0;
		await expect
			.poll(
				async () => {
					const state = await submissionStep(page);
					if (state.revealProgress) {
						sawATotalOf = Math.max(sawATotalOf, state.revealProgress.total);
					}
					return state.step;
				},
				{
					message: 'the submission should open the whole chain by itself',
					timeout: 120_000,
					intervals: [200],
				},
			)
			.toBe('Revealed');
		expect(
			sawATotalOf,
			'the reveal should have reported itself as a sequence of transactions',
		).toBeGreaterThan(1);

		// THE WHOLE TURN LANDED, not just the first chunk. This is the assertion
		// the feature exists for: without the chain advancing and the client
		// following it, the cells past the first chunk would simply never arrive.
		const placementCost = BigInt(
			await page.evaluate(() =>
				(
					globalThis as unknown as {context: any}
				).context.game.config.placementCost.toString(),
			),
		);
		await expect
			.poll(
				async () => {
					for (const cellID of cells) {
						const now = BigInt(await stakeOnCell(page, cellID));
						if (now !== (before.get(cellID) ?? 0n) + placementCost) {
							return false;
						}
					}
					return true;
				},
				{
					message: 'every cell of the turn should reach the board',
					timeout: 30_000,
				},
			)
			.toBe(true);

		expect(
			(await submissionStep(page)).planned,
			'the planned markers should have cleared',
		).toBe(0);
	});
});

/**
 * Missing a reveal, and being told about it.
 *
 * The nastiest state this game has: a commitment that is never revealed keeps
 * the bond and blocks every later commitment, and nothing resolves it on its
 * own. Settling it FORFEITS (what the placements would have cost when the
 * browser can show the chunks, the whole bond when it cannot), so the app must
 * never do it on the player's behalf - it has to say what happened, what it
 * cost, and wait to be asked.
 *
 * The reveal is missed here the way it is missed in real life: the tab goes
 * away before the reveal phase. The second half then uses a BRAND-NEW browser
 * context, so nothing is left in local storage and the only way the app can
 * know is by asking the chain.
 */
describe('A missed reveal', () => {
	// Its own burner account: this test deliberately leaves an unrevealed
	// commitment behind for a while, which would block the suite above.
	//
	// It was 1 for a long time, which is the CONTRACTS suite's, and nothing
	// noticed because the guard read only the first claim in a file. Under a
	// parallel run the two raced for one nonce.
	test.use({walletAccountIndex: 4});

	async function connectFrom(
		page: import('@playwright/test').Page,
		connectWallet: (page: import('@playwright/test').Page) => Promise<void>,
	) {
		await page.goto('/play');
		await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
		const connect = page.getByRole('button', {name: /^connect$/i}).first();
		await expect(connect).toBeEnabled({timeout: 60_000});
		await connect.click();
		await connectWallet(page);
	}

	test('is reported with what it cost, and settled only when asked', async ({
		browser,
		baseURL,
		connectWallet,
		fundWallets,
		authoriseBrowser,
	}) => {
		// A committed submission, then a whole cycle of waiting for it to lapse.
		test.setTimeout(400_000);
		await fundWallets();

		// --- commit, then walk away before the reveal ----------------------
		const first = await browser.newContext({
			baseURL,
			storageState: {cookies: [], origins: []},
		});
		const page = await first.newPage();
		await connectFrom(page, connectWallet);

		await authoriseToPlay(page, authoriseBrowser);

		// Clear anything an earlier run left behind, so this test creates the
		// state it is about rather than inheriting it.
		await clearAnyMissedReveal(page);

		// The label depends on whether there is anything staked yet: with an empty
		// reserve the HUD replaces the planning controls with the setup gate,
		// because planning a turn that cannot be committed only fails later. Both
		// labels go through the acquisition rail, which is ONE transaction that
		// stakes and funds the play key, so on a fresh account this is also what
		// authorises the browser.
		await stake(page);
		await expect
			.poll(async () => (await submissionStep(page)).reserve !== '0', {
				message: 'a reserve to bond from',
				timeout: 60_000,
			})
			.toBe(true);

		await planOnCanvas(page, {x: 70, y: 50});

		const commit = page.getByRole('button', {name: /commit now/i});
		if (await commit.isEnabled().catch(() => false)) await commit.click();
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the commitment should reach the chain',
				timeout: 90_000,
			})
			.toBe('Committed');

		// Lose everything this browser knew about the submission, without losing WHO
		// the player is.
		//
		// The claim under test is that the app learns about a missed reveal from
		// the CHAIN, so the submission's own record is deleted and the page reloaded.
		// It deliberately does not open a fresh browser context: the burner wallet
		// generates its accounts per browser, and signing in derives the signer
		// from those, so a clean context is a different player altogether and would
		// prove nothing.
		//
		// The committed turn goes too: since step 8 it is what restore takes the
		// turn back from (it is kept apart from the plan, in the account data),
		// so leaving it would not lose the submission at all. The settlement
		// below is then the one without the chunks, which forfeits the bond.
		await forgetSubmissionAndReload(page);
		await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
		const later = page;

		const notice = later.getByText(/you missed the reveal for cycle/i);
		// Nothing is owed until the cycle turns over, and the submission rechecks the
		// chain when it does. Allow more than one full cycle.
		await expect(
			notice,
			'the app should say a reveal was missed, from the chain alone',
		).toBeVisible({timeout: 180_000});

		// It has to say what it cost, not merely that something went wrong.
		await expect(later.getByText(/is forfeit/i)).toBeVisible();

		await expect(
			later.getByRole('button', {name: /commit now/i}),
			'committing is blocked until the forfeit is settled',
		).toBeDisabled();

		// Nothing has been spent on the player's behalf: the commitment is still
		// open, which is exactly why the notice is still up.
		const settle = later.getByRole('button', {
			name: /acknowledge missed reveal/i,
		});
		await expect(settle, 'settling it is offered, not done').toBeVisible();

		await settle.click();
		await expect(notice, 'acknowledging should clear the block').toBeHidden({
			timeout: 120_000,
		});

		await first.close();
	});
});

/**
 * A submission this browser has lost, which the chain still holds.
 *
 * NOT a storage feature, and the suite is arranged to say so. A cleared
 * browser, a second device, a second browser, a private window, a reinstall
 * and a storage write that silently failed all produce the identical state:
 * the contract holds a commitment, a reveal is owed this cycle, and this
 * client knows nothing about it. Unhandled, that costs the stake in silence.
 *
 * It is the sibling of the missed-reveal suite above, and the two are the same
 * subject at different points on the clock. There the reveal window has shut,
 * so the bond is gone and all that is left is to settle it; here the window is
 * still OPEN, so the whole difference is that somebody asked the chain in time.
 *
 * THE SUBMISSION IS DESTROYED THE SAME WAY the missed-reveal test destroys it,
 * and for the same reason: the submission's own record is deleted and the page
 * reloaded, rather than a fresh browser context being opened. The burner wallet
 * generates its accounts per browser and signing in derives the signer from
 * those, so a clean context is a DIFFERENT PLAYER altogether and would prove
 * nothing about recovery.
 *
 * IT ALL HAS TO HAPPEN INSIDE ONE CYCLE, which is what shapes the test. A
 * commitment is only recoverable while the cycle it belongs to is running - one
 * tick later it is a missed reveal, which is the suite above - so the re-entry
 * cannot use `planOnCanvas`, whose wait for the next play phase would be a wait
 * for the cycle that makes recovery impossible.
 *
 * WHAT THE HAPPY PATH PROVES that no unit test can: that the hash this app
 * builds a candidate plan into is the hash the CONTRACT stored. If the two
 * disagreed, the adopted submission would reveal and the reveal would revert,
 * and the last assertion here would never be reached. The refusal of a WRONG
 * plan is pinned by unit tests instead, and by mutation, because it needs no
 * chain.
 */
describe('A submission the chain holds and this browser has lost', () => {
	// Its own burner account: this test deliberately leaves a commitment that
	// nothing can open for a few seconds, which would block the suites above.
	// 2 is the out-of-gas suite's.
	test.use({walletAccountIndex: 5});

	test('is offered back, and the recovered submission reveals itself', async ({
		connectedPage,
		authoriseBrowser,
	}) => {
		test.slow();
		const page = connectedPage;

		await authoriseToPlay(page, authoriseBrowser);
		await clearAnyMissedReveal(page);
		await stake(page);
		await expect
			.poll(async () => (await submissionStep(page)).reserve !== '0', {
				message: 'a reserve to bond from',
				timeout: 60_000,
			})
			.toBe(true);

		// EVERYTHING AFTER THIS HAS TO FIT IN THE CYCLE, so the plan waits for a
		// play phase with room left in it. The ceiling is the play phase itself
		// (the commit phase less the allowance the submission keeps for the commit to
		// land), so asking for more than that waits forever; asking for too
		// little runs the re-entry into the tail of the commit phase, where
		// `autoCommit` would commit the re-entered plan instead of recovering
		// the lost one - benign, since the hash is the same, and it would take
		// the notice off the screen mid-test.
		//
		// ONE cell for the same reason: every extra click is budget. The size of
		// the plan is not what this proves, and a WRONG plan being refused needs
		// no chain at all, so it is pinned by unit tests instead.
		await planOnCanvas(page, {x: 70, y: 50}, 15);

		const commit = page.getByRole('button', {name: /commit now/i});
		if (await commit.isEnabled().catch(() => false)) await commit.click();
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the commitment should reach the chain',
				timeout: 60_000,
			})
			.toBe('Committed');

		// Lose everything this browser knew about the submission, without losing WHO
		// the player is. The commitment stays on chain; the secret is derived from
		// the signer and comes back with it; only the PLAN is gone.
		await forgetSubmissionAndReload(page);
		await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});

		expect(
			(await submissionStep(page)).step,
			'the submission itself must genuinely know nothing',
		).toBe('Idle');

		// MATCHED ON THE PLAYER'S WORDS, which are the game's and say "turn":
		// `CONTEXT.md` reserves that word for a game's own voice, and this game takes
		// it for one player's pass through a cycle - what the framework calls a
		// submission. The copy moved from "round" when that was settled, and this
		// locator moved with it. `check` does not type-check this directory, so a
		// locator left behind matches nothing and fails only here.
		const notice = page.getByText(/this browser no longer has the turn/i);
		await expect(
			notice,
			'the app should learn from the chain alone that a reveal is owed',
		).toBeVisible({timeout: 30_000});

		// It must not say the stake is gone. It is not, and that is the point.
		await expect(page.getByText(/can still be revealed/i)).toBeVisible();

		// The button's own label, which is the game's copy: see the notice above.
		const recover = page.getByRole('button', {name: /recover turn/i});
		await expect(
			recover,
			'recovery needs a plan to check, and there is none yet',
		).toBeDisabled();

		// The same turn, re-entered. Not through `planOnCanvas`: see the note
		// above about the cycle this has to stay inside.
		await clickCanvas(page, {x: 70, y: 50});
		await expect
			.poll(async () => (await submissionStep(page)).planned, {
				message: 'the same cell, re-entered',
				timeout: 15_000,
			})
			.toBe(1);

		await recover.click();
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'a recovered submission is a restored submission',
				timeout: 30_000,
			})
			.toBe('Committed');
		await expect(notice, 'nothing left to recover').toBeHidden();

		// THE ACCEPTANCE CRITERION. The stake is saved by the submission's ORDINARY
		// machinery - it reveals on the phase change like any other submission -
		// rather than by a second path written for recovery. Nothing was sent to the
		// chain to recover it; the commitment was already there.
		await expect
			.poll(async () => (await submissionStep(page)).step, {
				message: 'the recovered submission should reveal itself',
				timeout: 120_000,
			})
			.toBe('Revealed');
	});
});

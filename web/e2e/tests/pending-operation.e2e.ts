import type {Page} from '@playwright/test';
import {test, expect, describe} from '../fixtures/test';

/**
 * The transaction inspector, driven the way a user reaches it.
 *
 * Its unit tests cover the registry's rules; this covers the wiring those rules
 * sit on: a real operation in account data, a real click, a real URL. The
 * symptom it exists to catch is precise, and would pass every unit test: the
 * URL gains `?operation=<id>` and no dialog appears. That was real, and its
 * cause was that SvelteKit's `pushState` deliberately leaves `page.url` on the
 * route the page is showing, so the app read a URL without the param it had
 * just written and closed the overlay it had just opened.
 */
describe('Transaction inspector', () => {
	// Sends transactions, so it takes its own burner account: files run in
	// parallel workers and two sending from the same account race for a nonce.
	//
	// Index 3 rather than 2, because `out-of-gas.e2e.ts` needs 2 for a stronger
	// reason: it deliberately fails a commit, and the game keys one open
	// commitment per player per cycle, so it must not share a player with any
	// suite that commits. This one only needs an account nobody else sends from.
	test.use({walletAccountIndex: 3});

	// And serially WITHIN the file, for the same reason: `fullyParallel` applies
	// to tests, not just files, so these four would otherwise race each other
	// from that one account. Same rule, same cause, as the demo suite.
	describe.configure({mode: 'serial'});

	// It arrived from the template driving a greeting this app does not have, so
	// it had never run. Four things were wrong underneath that; three were test
	// bugs and are fixed, and they were worth finding on their own:
	//
	//  - it filled ONE argument of `addToReserve(address, uint256)`, so viem threw
	//    InvalidAddressError and nothing was sent. The same mistake made
	//    contracts.e2e.ts's write test vacuous for as long as it existed; that one
	//    now asserts an operation and passes for real.
	//  - it waited on the navbar PENDING BADGE, which clears at Included+Success
	//    and ignores finality, so against an instant-mining node it is open for
	//    ~400ms. The OPERATION persists (measured: Included/Success, `final`
	//    undefined), so it now waits for account data to hold one.
	//  - it took the drawer with `page.getByRole('dialog')`, which matches every
	//    dialog in every layer, so the visibility check was a strict-mode
	//    violation rather than a wait. Scoped to `#--layer-drawer`, as
	//    overlays.e2e.ts always has been.
	//
	// THE FOURTH WAS THE APP, and it is fixed. Reaching /transactions/ after a
	// write whose ARGS CONTAIN A NUMBER threw, uncaught:
	//
	//     TypeError: Do not know how to serialize a BigInt
	//
	// The URL changes, and then nothing renders and the drawer never closes.
	// Measured, with and without the preceding write:
	//
	//     no write:   +500ms url=/transactions/ heading=1   (fine)
	//     after write:+3000ms url=/transactions/ heading=0  + the TypeError
	//
	// So the link works - it was driven by hand too, and it navigates. What breaks
	// is rendering that page while an operation carries a bigint, which the
	// template's own demo never does because `setMessage(string)` has no numeric
	// argument. AccountData's storage serializer handles bigints correctly, so it
	// was not persistence; `core/utils/format/json.ts` had exported
	// `bigIntReplacer` and `toPlainJson` for exactly this the whole time and was
	// imported by nothing.
	//
	// OperationCard now stringifies with `bigIntReplacer`, and this suite is what
	// proves it: without that fix these three fail on a page that never renders.
	test.setTimeout(240_000);

	/**
	 * Leave an operation in account data and land on the transactions page.
	 *
	 * Two things here are deliberate, and both were learned by watching this fail.
	 *
	 * The WAIT: account data records an operation only once the transaction is
	 * broadcast, so leaving straight after the click abandons the send and the
	 * page has nothing to list. The navbar's pending badge is the app's own signal
	 * that an operation now exists.
	 *
	 * The CLIENT-SIDE navigation: `page.goto` is a full load, and account data is
	 * persisted asynchronously, so a reload immediately after the badge appears
	 * can discard an operation that was only ever in memory. Going through the
	 * menu is both what a user does and what keeps the app alive.
	 *
	 * WHAT IS SENT: a contracts-page write, not a game move. The inspector needs
	 * ONE operation in account data and does not care where it came from, and the
	 * game's commit is the wrong instrument for that - it depends on the cycle
	 * phase, keys one open commitment per player, and auto-commits as the phase
	 * closes, so a suite that only wants "a transaction happened" would be racing
	 * the submission for no reason. `addToReserve` is a plain account-sent write
	 * that exists on the deployed Game and needs no set-up, which is why
	 * contracts.e2e.ts uses it too.
	 *
	 * It also sends from the ACCOUNT rather than the local signer, so no
	 * authorisation flow stands in front of it. This used to submit the template's
	 * greeting, which this app does not have, and so failed at the first line.
	 */
	async function submitAndOpenTransactions(
		page: Page,
		connectWallet: (page: Page) => Promise<void>,
		amount: string,
	) {
		await page.goto('/contracts');

		// Wait for the connection to finish re-establishing after the navigation,
		// exactly as contracts.e2e.ts does. Interacting before it settles makes the
		// execute click open the connect modal instead of sending, and then nothing
		// is ever recorded - which is precisely the "no pending operation" this
		// suite was failing on.
		await expect(page.locator('[data-testid="wallet-status"]')).toHaveAttribute(
			'data-connected',
			'true',
			{timeout: 30000},
		);

		const writeTab = page.getByRole('tab', {name: 'Write'});
		await expect(writeTab).toBeVisible({timeout: 30000});
		await writeTab.click();

		const writeFunctionText = page.getByText('addToReserve nonpayable');
		await expect(writeFunctionText).toBeVisible({timeout: 30000});
		const form = page
			.locator('[class*="card"], [class*="function"]')
			.filter({has: writeFunctionText})
			.first();
		// BOTH inputs. `addToReserve(uint256 player, uint256 amount)` takes two,
		// and filling only the amount left the player undefined, so viem threw and
		// no transaction was ever sent. That is why this suite saw no pending
		// operation - nothing to do with how fast the node mines, which is what it
		// looked like from the outside.
		//
		// Both are numbers: the contract keys players by `uint256` rather than by
		// address, so that a game whose identity is a token changes no signature.
		const numbers = form.getByPlaceholder('Enter number or 0x...');
		await numbers.first().fill('0');
		await numbers.nth(1).fill(amount);
		await form
			.getByRole('button', {name: /execut/i})
			.first()
			.click();

		// THE OPERATION, not the navbar badge.
		//
		// The badge is `countPendingOperations`, which clears as soon as a
		// transaction is Included + Success and deliberately ignores finality:
		// hardhat only mines when something is sent, so an operation here never
		// becomes final and a badge that waited for that would never clear. Against
		// an instant-mining node the badge is therefore open for about 400ms, and
		// waiting on it is a race this suite lost every time.
		//
		// The OPERATION itself persists - measured as Included/Success/final=-, so
		// still not final, which is exactly what the inspector is for. Waiting for
		// account data to hold one is the same intent without the race.
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const ctx = (globalThis as any).context;
						let ops: Record<string, unknown> = {};
						ctx.accountData
							.watchField('operations')
							.subscribe((v: Record<string, unknown>) => (ops = v))();
						return Object.keys(ops ?? {}).length;
					}),
				{
					message: 'an operation should be recorded before leaving the page',
					timeout: 30000,
				},
			)
			.toBeGreaterThan(0);

		// CLIENT-SIDE, and it has to be. A full `page.goto` puts account data back
		// into its loading state, and in e2e it does not come out of it: the
		// transactions page then sits on "Loading transactions..." for ever and
		// there is nothing to inspect. Reaching the page through the app is not a
		// nicety here, it is the only route that works.
		// SCOPED TO ITS LAYER, which is the whole reason this used to fail.
		//
		// `page.getByRole('dialog')` matches EVERY dialog in every layer. Once more
		// than one is on screen - and by this point in the flow that is normal -
		// `expect(drawer).toBeVisible()` is a strict-mode violation rather than a
		// wait, so the retry below kept firing, and each retry clicked "Open menu"
		// again and TOGGLED the drawer shut. The link then took focus on a panel
		// that was closing and the page never moved, which looks exactly like a
		// broken link and is not one: driven by hand, it navigates fine.
		//
		// overlays.e2e.ts has always scoped by layer, which is why its drawer-link
		// test passes while this one did not.
		const drawer = page.locator('#--layer-drawer [role="dialog"]');
		if (!(await drawer.isVisible().catch(() => false))) {
			await expect(async () => {
				await page.getByLabel('Open menu').click();
				await expect(drawer).toBeVisible({timeout: 2000});
			}).toPass({timeout: 30000});
		}
		await drawer.getByRole('link', {name: /your transactions/i}).click();

		await expect(page.getByRole('heading', {name: 'Transactions'})).toBeVisible(
			{timeout: 10000},
		);
	}

	/**
	 * The `source` of every operation this browser has stored.
	 *
	 * Reads storage rather than the DOM, because the point is what SURVIVES: the
	 * replacement path runs against a stored operation, possibly sessions later,
	 * and a value that only ever existed in memory would not be there for it.
	 *
	 * `{$version, data: {operations}}` is synqable's shape, read here without
	 * going through it, exactly as `readStoredOperations` does and with the same
	 * caveat: it is not a public contract. This asserting nothing found is
	 * ambiguous between "the source is missing" and "the shape moved", so if this
	 * ever fails, check the shape before believing the feature is broken. (It
	 * failed that way once already, during the change that added it.)
	 *
	 * `call.source`, not `metadata.tx.source`: the route is a fact about the
	 * DISPATCH, so it sits beside `from` rather than inside what the app says the
	 * transaction means.
	 */
	async function storedTxSources(page: Page): Promise<unknown[]> {
		return page.evaluate(() => {
			type StoredOperation = {call?: {source?: unknown}};
			const found: unknown[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (!key?.startsWith('__private__')) continue;
				try {
					const blob = JSON.parse(localStorage.getItem(key) ?? '') as {
						data?: {operations?: Record<string, StoredOperation>};
					};
					for (const operation of Object.values(blob?.data?.operations ?? {})) {
						const source = operation?.call?.source;
						if (source !== undefined) found.push(source);
					}
				} catch {
					// Other things share the prefix; only account data parses this way.
				}
			}
			return found;
		});
	}

	/**
	 * Every stored operation, as it sits on disk.
	 *
	 * Same envelope and same caveat as {@link storedTxSources}; this one returns
	 * the whole record because the reload test below is about which FIELDS
	 * survive, not about one of them.
	 */
	async function storedOperations(page: Page): Promise<Record<string, any>[]> {
		return page.evaluate(() => {
			const found: Record<string, any>[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (!key?.startsWith('__private__')) continue;
				try {
					const blob = JSON.parse(localStorage.getItem(key) ?? '') as {
						data?: {operations?: Record<string, Record<string, any>>};
					};
					found.push(...Object.values(blob?.data?.operations ?? {}));
				} catch {
					// Other things share the prefix; only account data parses this way.
				}
			}
			return found;
		});
	}

	test('opens the inspector and puts the operation in the URL', async ({
		connectedPage,
		connectWallet,
	}) => {
		const page = connectedPage;
		await submitAndOpenTransactions(page, connectWallet, '0');

		const inspect = page.getByRole('button', {name: /inspect/i}).first();
		await expect(inspect).toBeVisible({timeout: 30000});
		await inspect.click();

		// Addressable: the operation id is in the URL, which is what makes the
		// inspector survive a reload and the back gesture close it.
		await expect(page).toHaveURL(/[?&]operation=/, {timeout: 10000});

		// And the modal is on screen. The bug was that this did not follow from
		// the URL having changed.
		await expect(page.getByRole('dialog')).toBeVisible({timeout: 10000});
		await expect(
			page.getByRole('dialog').getByText('Pending Transaction'),
		).toBeVisible();
	});

	test('closes on the back gesture, leaving the transactions page', async ({
		connectedPage,
		connectWallet,
	}) => {
		const page = connectedPage;
		await submitAndOpenTransactions(page, connectWallet, '0');

		await page
			.getByRole('button', {name: /inspect/i})
			.first()
			.click();
		await expect(page.getByRole('dialog')).toBeVisible({timeout: 10000});

		await page.goBack();

		await expect(page.getByRole('dialog')).toHaveCount(0);
		// The param goes with it: the overlay is not open, so it is not addressed.
		await expect(page).not.toHaveURL(/[?&]operation=/);
		await expect(
			page.getByRole('heading', {name: 'Transactions'}),
		).toBeVisible();
	});

	test('records WHICH ROUTE signed it, so it can be replaced later', async ({
		connectedPage,
		connectWallet,
	}) => {
		// THE ONE LINK NOTHING ELSE CHECKS END TO END. `source` is stamped by a
		// thunk handed to the tracker at construction, carried through the
		// broadcast event, and written into account data. Every step is unit-tested
		// and every step is in a different file, so the only thing that proves the
		// chain is joined up is reading it back out of storage after a real send.
		//
		// Without it, replacing a stuck transaction cannot tell which key to reopen,
		// and the transaction stays stuck forever. The failure is silent: the send
		// works, the operation is listed, and nothing looks wrong until somebody
		// needs to unstick one.
		const page = connectedPage;
		await submitAndOpenTransactions(page, connectWallet, '0');

		await expect
			.poll(() => storedTxSources(page), {timeout: 15000})
			.not.toHaveLength(0);

		// The route the app connection sends from, with the wallet named so a later
		// reconnection can ask for THAT wallet instead of opening a picker.
		expect((await storedTxSources(page))[0]).toMatchObject({
			route: 'account',
			// The wallet too, not just the route: naming it is what lets a later
			// reconnection reopen THAT wallet instead of raising a picker. Asserting
			// only the route would let `walletIdentityOf` silently return undefined.
			wallet: {name: expect.any(String)},
		});
	});

	/**
	 * THE RELOAD BETWEEN BROADCAST AND INCLUSION, which is the one window where
	 * the stored shape is all there is.
	 *
	 * Everything else in this file exercises an operation that stayed in memory
	 * from the moment it was created. A reload throws that away: the record has
	 * to come back off disk, through the store's load (and its migration), be
	 * projected into a freshly-built observer, and be patched by whatever that
	 * observer then reports. Every one of those steps is new in this change, and
	 * a mistake in any of them is INVISIBLE without the reload, because the
	 * in-memory object papers over the stored one.
	 *
	 * What it pins is the restructure's whole point: the observer's update writes
	 * state and ONLY state. If the wholesale replace ever comes back, the record
	 * that survives the reload loses its source and its calldata, and this fails.
	 */
	test('keeps its dispatch facts across a reload, while the observer updates it', async ({
		connectedPage,
		connectWallet,
	}) => {
		const page = connectedPage;
		await submitAndOpenTransactions(page, connectWallet, '0');

		// Wait for the record to actually be on disk: synqable debounces its
		// saves, and reloading before the write tests nothing at all.
		await expect
			.poll(() => storedOperations(page), {timeout: 30_000})
			.not.toHaveLength(0);

		const before = (await storedOperations(page))[0];
		// The new shape, as written by this build.
		expect(before.call?.source).toMatchObject({route: 'account'});
		expect(before.attempts?.length).toBeGreaterThan(0);
		expect(before).not.toHaveProperty('transactionIntent');

		const hash = before.attempts[0].hash;
		const calldata = before.call.data;

		await page.reload();
		await expect(page.getByRole('heading', {name: 'Transactions'})).toBeVisible(
			{
				timeout: 30_000,
			},
		);

		// The observer, rebuilt from storage, reaches a verdict on it. Included is
		// the expected end state on a local chain; the operation is REMOVED once
		// that is final, so "gone" is also a pass, and both prove the projection
		// fed after a reload was one the observer could act on.
		await expect
			.poll(
				async () => {
					const operations = await storedOperations(page);
					if (operations.length === 0) return 'gone';
					return operations[0].state?.inclusion ?? 'none';
				},
				{timeout: 60_000},
			)
			.toMatch(/Included|gone/);

		// AND THE DISPATCH FACTS ARE STILL THERE, if the record still is. This is
		// the assertion the deleted merge would break: the observer never had the
		// source or the calldata, so an update that rebuilt the record from the
		// observer's own transactions would have dropped both.
		const after = await storedOperations(page);
		if (after.length > 0) {
			expect(after[0].call.source).toMatchObject({route: 'account'});
			expect(after[0].call.data).toBe(calldata);
			expect(after[0].attempts[0].hash).toBe(hash);
			expect(after[0].attempts[0].gasParameters).toBeDefined();
			// And the metadata is still only what the transaction means.
			expect(after[0].metadata).not.toHaveProperty('tx');
			expect(after[0].metadata).not.toHaveProperty('operationId');
		}
	});

	test('survives a reload, because it is in the URL', async ({
		connectedPage,
		connectWallet,
	}) => {
		const page = connectedPage;
		await submitAndOpenTransactions(page, connectWallet, '0');

		await page
			.getByRole('button', {name: /inspect/i})
			.first()
			.click();
		await expect(page.getByRole('dialog')).toBeVisible({timeout: 10000});

		const addressed = page.url();
		const operationId = new URL(addressed).searchParams.get('operation');
		expect(operationId, 'the inspector addresses an operation').toBeTruthy();

		// Account data is persisted asynchronously, so reloading the instant the
		// dialog appears can discard an operation that was still only in memory,
		// and the inspector then correctly reports it as gone. Wait for the write
		// first: this test is about the URL surviving a reload, not about racing
		// storage.
		await expect
			.poll(
				async () =>
					page.evaluate((id) => {
						for (let i = 0; i < localStorage.length; i++) {
							const key = localStorage.key(i);
							if (key && (localStorage.getItem(key) ?? '').includes(id)) {
								return true;
							}
						}
						return false;
					}, operationId as string),
				{timeout: 15000},
			)
			.toBe(true);

		await page.goto(addressed);

		// The OPERATION is back, not merely some dialog: a cleared or unknown
		// operation now renders its own dialog too, so asserting on the dialog
		// alone would pass for the failure this test exists to catch.
		await expect(
			page.getByRole('dialog').getByText('Pending Transaction'),
		).toBeVisible({timeout: 30000});
	});
});

import type {Page} from '@playwright/test';
import {
	test,
	expect,
	describe,
	connectWalletDevMode,
	isWalletConnected,
} from '../fixtures/test';
import {
	authoriseToPlay,
	boardLoaded,
	clickCell,
	gameStep,
	getTestGems,
	stake,
} from '../fixtures/stratagems';

/**
 * PLAYERS WITH NO ETH, AT A TABLE (step L3, L3-22 of
 * work/plans/join-template-commit-reveal.md): how a room plays stratagems on a
 * LAN box (github:wighawag/ethereum-lan-node). Two browsers, each a fresh
 * burner with nothing in it, the box's faucet the only source of ether: the
 * creator makes a table from the lobby, the guest opens its link, both take a
 * seat by staking, and one cycle is played.
 *
 * This repo's version of the template's suite (which acquires the reference
 * game's stake, alone), and the successor of step L2's by-hand rehearsal
 * (`web/e2e/lan/`, removed in L3), on the shared fixtures and config. Run
 * against the package by `scripts/rehearse-lan.sh` (geth, plain http on the
 * LAN address, an insecure context).
 *
 * SKIPPED IN THE NORMAL E2E (`scripts/run-e2e-tests.sh`, which starts a faucet
 * too), measured in step L3: it passed there alone (37 s), and in two of three
 * full parallel runs the creator's commit was mined while the page went on
 * rebroadcasting it ("Nonce too low"), so "Commit now" stayed disabled past the
 * table's short e2e commit phase and the turn was lost. A finding for the
 * template tree's transaction layer, recorded in the plan's Progress log; the
 * normal suite already plays a table in two browsers (stratagems-table.e2e.ts).
 */

// Its own account, a claim test/e2e-account-claims.test.ts checks. The guest
// connects in a browser context of its own, whose burner generates a mnemonic
// of its own, so its accounts are nobody else's.
test.use({walletAccountIndex: 2});

const FAUCET_URL = (globalThis as any).process.env.E2E_FAUCET_URL as
	string | undefined;
/** Set by scripts/rehearse-lan.sh, and only there. */
const LAN_URL = (globalThis as any).process.env.E2E_LAN_URL as
	string | undefined;

function log(label: string, ...rest: unknown[]) {
	console.log(`[faucet e2e] ${new Date().toISOString()} ${label}`, ...rest);
}

/** What the page itself says about where it runs. */
async function facts(page: Page) {
	return page.evaluate(() => ({
		href: location.href,
		secure: window.isSecureContext,
		locks: 'locks' in navigator,
		serviceWorker: 'serviceWorker' in navigator,
	}));
}

/** The app's own judgement of its node, with the error it saw, if any. */
async function rpcHealth(page: Page) {
	return page.evaluate(() => {
		const context = (globalThis as unknown as {context: any}).context;
		let value: any;
		context?.rpcHealth?.subscribe((v: unknown) => (value = v))();
		return JSON.stringify(value)?.slice(0, 600);
	});
}

/** The account's ether, read through the page's own client. */
async function balanceOf(page: Page): Promise<bigint> {
	return BigInt(
		await page.evaluate(async () => {
			const context = (globalThis as unknown as {context: any}).context;
			let account: any;
			context.account.subscribe((v: unknown) => (account = v))();
			return account
				? (await context.publicClient.getBalance({address: account})).toString()
				: '0';
		}),
	);
}

/** Every request to the faucet, and the page's own errors, for the report. */
function watch(page: Page, claims: string[], errors: string[]) {
	page.on('request', (request) => {
		if (FAUCET_URL && request.url().startsWith(FAUCET_URL))
			claims.push(request.url());
	});
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	// every JSON-RPC call to the node that came back with an error
	const node = (globalThis as any).process.env.E2E_RPC_URL as
		string | undefined;
	page.on('requestfinished', async (request) => {
		if (!node || !request.url().startsWith(node)) return;
		const body =
			(await (await request.response())?.text().catch(() => '')) ?? '';
		if (body.includes('"error"'))
			errors.push(
				`rpc ${request.postData()?.slice(0, 300)} -> ${body.slice(0, 300)}`,
			);
	});
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
	});
}

/** Open `path` and sign in, WITHOUT funding anything. */
async function connectEmpty(page: Page, path: string) {
	await page.goto(path);
	// The board's canvas where there is one; the lobby has none.
	const connect = page.getByRole('button', {name: /^connect$/i}).first();
	if (path.startsWith('/play'))
		await expect(page.locator('canvas')).toBeVisible({timeout: 60_000});
	else await expect(connect).toBeVisible({timeout: 60_000});
	log('facts', await facts(page));
	log('rpc health', await rpcHealth(page));
	if (!(await isWalletConnected(page))) {
		await expect(connect).toBeEnabled({timeout: 60_000});
		await connect.click();
		await connectWalletDevMode(page, 0);
	}
	expect(await balanceOf(page), 'a fresh burner starts with no ether').toBe(0n);
}

/**
 * Answer the insufficient-funds dialog with its "Get ETH", the faucet, and
 * carry on with what it interrupted. Whether it came at all is returned.
 */
async function faucetIfAsked(page: Page, wait = 15_000): Promise<boolean> {
	const getEth = page.getByRole('button', {name: /get eth/i});
	const asked = await getEth
		.waitFor({state: 'visible', timeout: wait})
		.then(() => true)
		.catch(() => false);
	if (!asked) return false;
	await expect(getEth).toBeEnabled({timeout: 30_000});
	await getEth.click();
	await expect
		.poll(() => balanceOf(page), {
			message: 'the faucet should fund the account',
			timeout: 60_000,
		})
		.toBeGreaterThan(0n);
	log('funded by the faucet', await balanceOf(page));
	const resume = page.getByRole('button', {name: /continue transaction/i});
	if (
		await resume
			.waitFor({state: 'visible', timeout: 30_000})
			.then(() => true)
			.catch(() => false)
	)
		await resume.click();
	return true;
}

/** Gems from the HUD, then the stake, each answering the faucet if it asks. */
async function takeSeat(
	page: Page,
	authoriseBrowser: Parameters<typeof authoriseToPlay>[1],
) {
	// The first transaction an empty burner sends: the faucet is offered here
	// if it was not already at the table's creation.
	const button = page.locator('[data-testid="get-test-gems"]');
	await expect(button, 'the HUD should offer test gems').toBeEnabled({
		timeout: 60_000,
	});
	if ((await balanceOf(page)) === 0n) {
		await button.click();
		expect(
			await faucetIfAsked(page, 30_000),
			'an empty burner should be offered the faucet',
		).toBe(true);
	}
	await getTestGems(page);
	await stake(page);
	await faucetIfAsked(page, 5_000);
	await authoriseToPlay(page, authoriseBrowser);
}

async function rosterOf(
	page: Page,
): Promise<{members: number; started: boolean} | undefined> {
	return page.evaluate(() => {
		const context = (globalThis as unknown as {context: any}).context;
		let value: any;
		context.game.table.subscribe((v: unknown) => (value = v))();
		return value.step === 'Loaded'
			? {members: value.roster.members.length, started: value.roster.started}
			: undefined;
	});
}

async function cycleOf(
	page: Page,
): Promise<{cycleNumber: number; commiting: boolean}> {
	return page.evaluate(async () => {
		const context = (globalThis as unknown as {context: any}).context;
		const game = context.deployments.get().contracts.Stratagems;
		const cycle = await context.publicClient.readContract({
			address: game.address,
			abi: game.abi,
			functionName: 'getCycle',
		});
		return {
			cycleNumber: Number(cycle.cycleNumber),
			commiting: cycle.commiting,
		};
	});
}

async function canPlay(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const context = (globalThis as unknown as {context: any}).context;
		let value = false;
		context.game.readyToPlay.subscribe((v: boolean) => (value = v))();
		return value;
	});
}

/** A line in the run's output: where the table and this page's submission are. */
async function trace(page: Page, label: string): Promise<void> {
	const cycle = await page
		.evaluate(async () => {
			const context = (globalThis as unknown as {context: any}).context;
			const game = context.deployments.get().contracts.Stratagems;
			const c = await context.publicClient.readContract({
				address: game.address,
				abi: game.abi,
				functionName: 'getCycle',
			});
			return `${c.cycleNumber} ${c.commiting ? 'commit' : 'reveal'} ends ${c.phaseEnd}`;
		})
		.catch(() => undefined);
	const step = await gameStep(page).catch(() => undefined);
	log(
		`${label}: cycle ${cycle}, submission ${step?.step} planned ${step?.planned} phase ${step?.phase} ${step?.timeLeft}s`,
	);
}

/** Plan one placement on `cell` and commit it now. */
async function planAndCommit(page: Page, cell: {x: number; y: number}) {
	await page.bringToFront();
	await trace(page, `planAndCommit(${cell.x},${cell.y})`);
	await expect
		.poll(() => canPlay(page), {
			message: 'the board should take a turn',
			timeout: 60_000,
		})
		.toBe(true);
	await trace(page, 'ready');
	await boardLoaded(page);
	await trace(page, 'board loaded');
	await expect
		.poll(
			async () => {
				if ((await gameStep(page)).planned === 0) await clickCell(page, cell);
				return (await gameStep(page)).planned;
			},
			{message: 'one move should be planned', timeout: 60_000},
		)
		.toBe(1);
	await trace(page, 'planned');
	const commit = page.getByRole('button', {name: /commit now/i});
	await expect(commit, 'the turn should be committable').toBeEnabled({
		timeout: 60_000,
	});
	await commit.click();
	await expect
		.poll(async () => (await gameStep(page)).step, {
			message: 'the commitment should reach the chain',
			timeout: 120_000,
		})
		.toMatch(/^(Committed|Revealing|Revealed)$/);
	log('committed', await cycleOf(page));
}

describe('Players with no ETH', () => {
	test.skip(
		!FAUCET_URL || !LAN_URL,
		'the LAN rehearsal suite: run through scripts/rehearse-lan.sh (see the note at the top)',
	);

	test('get ETH from the faucet, take a seat at a table, and play a cycle', async ({
		page,
		browser,
		authoriseBrowser,
	}) => {
		test.setTimeout(900_000);
		const claims: string[] = [];
		const errors: string[] = [];
		const host = page;
		watch(host, claims, errors);

		// THE CREATOR, from the lobby, with nothing.
		await connectEmpty(host, '/lobby/');
		await host.getByTestId('table-seats-2').click();
		await host.getByTestId('table-create').click();
		// Creating is the first transaction, so the faucet comes here.
		await faucetIfAsked(host, 60_000);
		await host.waitForURL(/[?&]game=0x[0-9a-fA-F]{40}/, {timeout: 120_000});
		const table = new URL(host.url()).searchParams.get('game');
		if (!table) throw new Error('the lobby did not open the table');
		log('table', table);
		await expect(host.locator('canvas')).toBeVisible({timeout: 60_000});
		await takeSeat(host, authoriseBrowser);
		await expect
			.poll(async () => (await rosterOf(host))?.members, {
				message: 'the creator should be seated by their stake',
				timeout: 120_000,
			})
			.toBe(1);
		expect(claims, 'the creator should have asked the faucet').not.toEqual([]);
		const creatorClaims = claims.length;

		// THE GUEST, in a browser of their own, from the invite link.
		const guestContext = await browser.newContext({
			storageState: {cookies: [], origins: []},
		});
		const guest = await guestContext.newPage();
		watch(guest, claims, errors);
		try {
			await connectEmpty(guest, `/play/?game=${table}`);
			await takeSeat(guest, authoriseBrowser);
			await expect
				.poll(async () => (await rosterOf(host))?.members, {
					message: 'the guest should take the second seat',
					timeout: 120_000,
				})
				.toBe(2);
			expect(
				claims.length,
				'the guest should have asked the faucet',
			).toBeGreaterThan(creatorClaims);

			// START, then one cycle, advanced early: both commit, both reveal.
			await expect(host.getByTestId('table-start')).toBeEnabled({
				timeout: 60_000,
			});
			await host.getByTestId('table-start').click();
			await expect
				.poll(async () => (await rosterOf(host))?.started, {
					message: 'the creator should start the table',
					timeout: 120_000,
				})
				.toBe(true);
			const first = await cycleOf(host);
			log('started', first);

			await planAndCommit(host, {x: 2, y: 2});
			await planAndCommit(guest, {x: -3, y: -3});
			for (const p of [host, guest]) {
				await expect
					.poll(async () => (await gameStep(p)).step, {
						message: 'each submission should reveal itself',
						timeout: 240_000,
					})
					.toBe('Revealed');
			}
			await expect
				.poll(async () => (await cycleOf(host)).cycleNumber, {
					message: 'the next cycle should start once both have revealed',
					timeout: 240_000,
				})
				.toBe(first.cycleNumber + 1);

			// The board is the table's, folded in the browser from its events.
			await expect
				.poll(
					() =>
						host.evaluate(() => {
							const context = (globalThis as unknown as {context: any}).context;
							let value: any;
							context.onchainState.subscribe((v: unknown) => (value = v))();
							return value.step === 'Loaded'
								? Object.keys(value.data.owners).length
								: -1;
						}),
					{
						message: 'the table board should hold both cells',
						timeout: 120_000,
					},
				)
				.toBe(2);
		} finally {
			log('guest rpc health', await rpcHealth(guest).catch(() => 'closed'));
			log('page errors', errors.slice(0, 15));
			await guestContext.close();
		}
	});
});

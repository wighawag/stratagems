/**
 * THE LAN REHEARSAL (step L2 of work/plans/join-template-commit-reveal.md, item
 * 7): a table played in two browsers against a box like the maintainer's
 * `ethereum-lan-node`, served over plain http on a non-localhost address, where
 * both players start with no ether and the box's faucet is the only source of
 * it. NOT part of `pnpm test:e2e` (its config is its own, with no web server):
 * everything it talks to must already be running. As step L2 ran it:
 *
 *   1. geth from the box's genesis with the box's flags (`nix/chain.nix`), its
 *      RPC on a free port (28545 here; never 8545 or 8546 on a shared machine);
 *   2. the box's faucet package with `CORS_ORIGINS='*'` on 34010;
 *   3. `ETH_NODE_URI_lan=http://127.0.0.1:28545 pnpm --filter ./contracts
 *      deploy:dev lan`, `pnpm contracts:export lan`, and `pnpm --filter ./web
 *      build lan` with a `web/.env.lan.local` moving the node to `//:28545`;
 *   4. `python3 -m http.server 4180 --bind <LAN address>` in `web/build`;
 *   5. `PUBLIC_IMPERSONATE_ADDRESSES=0x000000000000000000000000000000000000dEaD
 *      LAN_URL=http://<LAN address>:4180 E2E_RPC_URL=http://127.0.0.1:28545
 *      pnpm exec playwright test -c e2e/lan/playwright.lan.config.ts` in `web/`
 *      (the fixtures want an impersonation list; the `lan` build offers none).
 *
 * The node's port is the one thing that must match the build (`E2E_RPC_URL`
 * only filters which calls the trace reports).
 */
import {test, expect, type Page} from '@playwright/test';
import {connectWalletDevMode, isWalletConnected} from '../fixtures/test';
import {
	boardLoaded,
	clickCell,
	gameStep,
	gems,
	stake,
} from '../fixtures/stratagems';

/** The node's port, whose JSON-RPC errors the run reports. */
const NODE_PORT = `:${new URL(process.env.E2E_RPC_URL ?? 'http://127.0.0.1:28545').port}`;

function log(label: string, ...rest: unknown[]) {
	console.log(`[lan] ${new Date().toISOString()} ${label}`, ...rest);
}

/** The page's environment, as the page itself reads it. */
async function facts(page: Page) {
	return page.evaluate(() => ({
		href: location.href,
		secure: window.isSecureContext,
		subtle: typeof crypto.subtle,
		randomUUID: typeof (crypto as any).randomUUID,
		serviceWorker: 'serviceWorker' in navigator,
		locks: 'locks' in navigator,
	}));
}

async function balanceOf(page: Page): Promise<bigint> {
	return BigInt(
		await page.evaluate(async () => {
			const c = (globalThis as any).context;
			let account: any;
			c.account.subscribe((v: any) => (account = v))();
			return account
				? (await c.publicClient.getBalance({address: account})).toString()
				: '0';
		}),
	);
}

async function connect(page: Page, path: string, errors: string[]) {
	// every JSON-RPC call to the node that comes back with an error
	page.on('requestfinished', async (request) => {
		if (!request.url().includes(NODE_PORT)) return;
		const response = await request.response();
		const body = (await response?.text().catch(() => '')) ?? '';
		if (body.includes('"error"')) {
			errors.push(
				`rpc ${request.postData()?.slice(0, 600)} -> ${body.slice(0, 300)}`,
			);
			log(
				'rpc error',
				request.postData()?.slice(0, 600),
				'->',
				body.slice(0, 300),
			);
		}
	});
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
	});
	await page.goto(path);
	if (path.startsWith('/play')) {
		await expect(page.locator('canvas')).toBeVisible({timeout: 60_000});
	} else {
		await expect(
			page.getByRole('button', {name: /^connect$/i}).first(),
		).toBeVisible({timeout: 60_000});
	}
	log('facts', await facts(page));
	if (!(await isWalletConnected(page))) {
		const button = page.getByRole('button', {name: /^connect$/i}).first();
		await expect(button).toBeEnabled({timeout: 60_000});
		await button.click();
		await connectWalletDevMode(page, 0);
	}
	await expect
		.poll(() => isWalletConnected(page), {timeout: 60_000})
		.toBe(true);
	log('connected', page.url(), 'balance', await balanceOf(page));
}

/** Answer the insufficient-funds modal with the box's faucet, if it is up. */
async function faucetIfAsked(page: Page, wait = 15_000) {
	const getEth = page.getByRole('button', {name: /get eth/i});
	if (
		await getEth
			.waitFor({state: 'visible', timeout: wait})
			.then(() => true)
			.catch(() => false)
	) {
		log('faucet: the insufficient-funds modal offers it');
		await getEth.click();
		await expect
			.poll(() => balanceOf(page), {
				message: 'the faucet should fund the account',
				timeout: 60_000,
			})
			.toBeGreaterThan(0n);
		log('faucet: funded', await balanceOf(page));
		const resume = page.getByRole('button', {name: /continue transaction/i});
		if (
			await resume
				.waitFor({state: 'visible', timeout: 30_000})
				.then(() => true)
				.catch(() => false)
		) {
			await resume.click();
			log('faucet: the transaction continues');
		}
		return true;
	}
	return false;
}

/**
 * The faucet's API from the page (what its link's page does): the lobby's
 * "Create a table" does not go through the balance check, so it offers no
 * faucet (a finding of this rehearsal).
 */
async function faucetDirect(page: Page) {
	const status = await page.evaluate(async () => {
		const c = (globalThis as any).context;
		let account: any;
		c.account.subscribe((v: any) => (account = v))();
		const response = await fetch(
			`http://${location.hostname}:34010/api/claim`,
			{
				method: 'POST',
				headers: {'content-type': 'application/json'},
				body: JSON.stringify({
					token: 'lan',
					chainId: String(c.deployments.get().chain.id),
					address: account,
				}),
			},
		);
		return `${response.status} ${await response.text()}`;
	});
	log('faucet direct', status.slice(0, 200));
	await expect
		.poll(() => balanceOf(page), {timeout: 60_000})
		.toBeGreaterThan(0n);
}

async function seat(page: Page) {
	// gems from the distributor (which, with no ETH yet, is where the faucet is offered)
	for (let i = 0; i < 4; i++) {
		const {wallet, stake: needed} = await gems(page);
		if (wallet !== undefined && wallet >= needed) break;
		await page.locator('[data-testid="get-test-gems"]').click();
		await faucetIfAsked(page);
		await expect
			.poll(async () => (await gems(page)).wallet ?? 0n, {timeout: 90_000})
			.toBeGreaterThan(wallet ?? 0n);
	}
	log('gems', await gems(page));
	await stake(page);
	await faucetIfAsked(page);
	const authorise = page.getByRole('button', {name: /authorise and carry on/i});
	if (await authorise.isVisible({timeout: 10_000}).catch(() => false)) {
		log('authorise asked');
		await authorise.click();
	}
}

async function roster(page: Page) {
	return page.evaluate(() => {
		let v: any;
		(globalThis as any).context.game.table.subscribe((x: any) => (v = x))();
		return v.step === 'Loaded'
			? {members: v.roster.members.length, started: v.roster.started}
			: undefined;
	});
}

async function cycleOf(page: Page) {
	return page.evaluate(async () => {
		const c = (globalThis as any).context;
		const g = c.deployments.get().contracts.Stratagems;
		const cy = await c.publicClient.readContract({
			address: g.address,
			abi: g.abi,
			functionName: 'getCycle',
		});
		return {cycleNumber: Number(cy.cycleNumber), commiting: cy.commiting};
	});
}

async function planAndCommit(page: Page, cell: {x: number; y: number}) {
	await page.bringToFront();
	await boardLoaded(page);
	await expect
		.poll(
			async () => {
				if ((await gameStep(page)).planned === 0) await clickCell(page, cell);
				return (await gameStep(page)).planned;
			},
			{timeout: 60_000},
		)
		.toBe(1);
	const commit = page.getByRole('button', {name: /commit now/i});
	await expect(commit).toBeEnabled({timeout: 60_000});
	await commit.click();
	await expect
		.poll(async () => (await gameStep(page)).step, {timeout: 120_000})
		.toMatch(/^(Committed|Revealing|Revealed)$/);
	log('committed', await cycleOf(page));
}

test('a table on the LAN: created, a guest funded by the faucet seated, started, a cycle played', async ({
	browser,
}) => {
	const hostErrors: string[] = [];
	const guestErrors: string[] = [];
	const hostContext = await browser.newContext();
	const host = await hostContext.newPage();
	try {
		await connect(host, '/lobby/', hostErrors);
		expect(await balanceOf(host), 'the host starts with no ether').toBe(0n);
		await host.getByTestId('table-seats-2').click();
		await host.getByTestId('table-create').click();
		expect(
			await faucetIfAsked(host, 60_000),
			'creating a table should offer the faucet',
		).toBe(true);
		await host.waitForURL(/[?&]game=0x[0-9a-fA-F]{40}/, {timeout: 120_000});
		const table = new URL(host.url()).searchParams.get('game')!;
		log('table', table);
		await expect(host.locator('canvas')).toBeVisible({timeout: 60_000});
		await seat(host);
		await expect
			.poll(() => roster(host), {timeout: 120_000})
			.toMatchObject({members: 1});
		log('host seated');

		const guestContext = await browser.newContext();
		const guest = await guestContext.newPage();
		try {
			await connect(guest, `/play/?game=${table}`, guestErrors);
			expect(await balanceOf(guest), 'the guest starts with no ether').toBe(0n);
			await seat(guest);
			await expect
				.poll(() => roster(host), {timeout: 120_000})
				.toMatchObject({members: 2});
			log('guest seated, funded by the faucet', await balanceOf(guest));

			await host.getByTestId('table-start').click();
			await expect
				.poll(() => roster(host), {timeout: 120_000})
				.toMatchObject({started: true});
			const first = await cycleOf(host);
			log('started', first);

			await planAndCommit(host, {x: 1, y: 1});
			await planAndCommit(guest, {x: -2, y: -2});
			await expect
				.poll(async () => (await cycleOf(host)).commiting, {timeout: 120_000})
				.toBe(false);
			log('reveal phase opened early', await cycleOf(host));
			for (const page of [host, guest]) {
				await expect
					.poll(async () => (await gameStep(page)).step, {timeout: 180_000})
					.toBe('Revealed');
			}
			await expect
				.poll(async () => (await cycleOf(host)).cycleNumber, {timeout: 180_000})
				.toBe(first.cycleNumber + 1);
			log('cycle played: the next one started', await cycleOf(host));
			const owners = () =>
				host.evaluate(() => {
					let v: any;
					(globalThis as any).context.onchainState.subscribe(
						(x: any) => (v = x),
					)();
					return v.step === 'Loaded' ? Object.keys(v.data.owners).length : -1;
				});
			// the board is the table's own, folded in the browser from the chain
			await expect
				.poll(owners, {
					message: 'the indexed board should hold both cells',
					timeout: 90_000,
				})
				.toBe(2);
			log('board cells', await owners());
		} finally {
			log('guest errors', guestErrors.slice(0, 15));
			await guestContext.close();
		}
	} finally {
		log('host errors', hostErrors.slice(0, 15));
		await hostContext.close();
	}
});

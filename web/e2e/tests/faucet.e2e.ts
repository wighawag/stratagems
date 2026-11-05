import {test, expect} from '../fixtures/test';
import {stake, submissionStep} from '../fixtures/game';

// Its own account, which no other suite funds, so it starts EMPTY: see
// test/e2e-account-claims.test.ts.
test.use({walletAccountIndex: 8});

const FAUCET_URL = (globalThis as any).process.env.E2E_FAUCET_URL as
	string | undefined;

test.describe('A player with no ETH', () => {
	test.skip(!FAUCET_URL, 'no faucet: run through scripts/run-e2e-tests.sh');

	// How a player on a LAN box (or any chain with a faucet) starts: a fresh
	// burner, nothing in it, and "Get ETH" in the insufficient-funds dialog,
	// which claims from the faucet (PUBLIC_FAUCET_API) and carries on. This
	// repo's version of the template's suite, which used the greetings demo:
	// the first thing a player pays for here is their stake.
	test('gets ETH from the faucet, and acquires a stake', async ({
		page,
		connectWallet,
	}) => {
		test.setTimeout(5 * 60_000);
		const claims: string[] = [];
		page.on('request', (request) => {
			if (request.url().startsWith(FAUCET_URL!)) claims.push(request.url());
		});

		await page.goto('/play');
		await expect(page.locator('canvas')).toBeVisible({timeout: 30_000});
		const connect = page.getByRole('button', {name: /^connect$/i}).first();
		await expect(connect).toBeEnabled({timeout: 60_000});
		await connect.click();
		await connectWallet(page, {fund: false});

		await stake(page);
		// Walks whatever comes up, the insufficient-funds dialog included: its
		// "Get ETH" is the faucet.
		await connectWallet(page, {fund: false});
		await expect
			.poll(async () => (await submissionStep(page)).reserve ?? '0', {
				message: 'the stake should be acquired',
				timeout: 120_000,
			})
			.not.toBe('0');

		expect(claims, 'the faucet should have been asked for ETH').not.toEqual([]);
	});
});

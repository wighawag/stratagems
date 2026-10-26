/**
 * THE ONE-TRANSACTION STAKE: `addToReserveAndFund` credits the player's reserve
 * from the caller's gems and forwards what it is sent to the key that will play
 * for them, so the template's acquisition rail can stake and fund that key in
 * one wallet transaction (`web/src/lib/stratagems/stake.ts`).
 */
import {expect, describe, it} from 'vitest';
import {parseEther, zeroAddress} from 'viem';
import {getConnection, loadFixture} from '../utils/connection.js';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test.js';

async function withPlayerHoldingGems() {
	const env = await deployStratagemsWithTestConfig();
	const player = env.otherAccounts[0];
	await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
	return {env, player};
}

describe('addToReserveAndFund', function () {
	it('credits the reserve and forwards the value to the key, in one transaction', async function () {
		const {env, player} = await loadFixture(withPlayerHoldingGems);
		const {publicClient} = await getConnection();
		const S = env.Stratagems as any;
		const key = '0x00000000000000000000000000000000000c0ffe' as const;
		const stipend = parseEther('0.01');

		const gemsBefore = await env.TestTokens.read.balanceOf([player]);
		const keyBefore = await publicClient.getBalance({address: key});
		await S.write.addToReserveAndFund([BigInt(player), parseEther('32'), key], {account: player, value: stipend});

		expect(await S.read.getReserve([BigInt(player)])).to.equal(parseEther('32'));
		expect(await env.TestTokens.read.balanceOf([player])).to.equal(gemsBefore - parseEther('32'));
		expect((await publicClient.getBalance({address: key})) - keyBefore).to.equal(stipend);
		expect(await publicClient.getBalance({address: env.Stratagems.address})).to.equal(0n);
	});

	it('credits the reserve alone when sent nothing, whatever the key', async function () {
		const {env, player} = await loadFixture(withPlayerHoldingGems);
		const S = env.Stratagems as any;
		await S.write.addToReserveAndFund([BigInt(player), parseEther('5'), zeroAddress], {account: player});
		expect(await S.read.getReserve([BigInt(player)])).to.equal(parseEther('5'));
	});

	it('refuses a value with nowhere to go', async function () {
		const {env, player} = await loadFixture(withPlayerHoldingGems);
		const S = env.Stratagems as any;
		await expect(
			S.write.addToReserveAndFund([BigInt(player), parseEther('5'), zeroAddress], {
				account: player,
				value: parseEther('0.01'),
			}),
		).rejects.toThrow(/StipendWithoutRecipient/);
		expect(await S.read.getReserve([BigInt(player)])).to.equal(0n);
	});
});

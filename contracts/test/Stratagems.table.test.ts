/**
 * A TABLE: one stratagems game for a fixed set of players, at an address of its
 * own (step L2 of work/plans/join-template-commit-reveal.md). Its seats are
 * taken by staking, as the world's are, but a table has no global approval on
 * the tokens (the world's is granted per address by its deploy), so it is paid
 * by an ordinary allowance (PL2-1), as any ERC20 would need.
 */
import {expect, describe, it} from 'vitest';
import {parseEther} from 'viem';
import {loadFixture} from '../utils/connection.js';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test.js';

async function withTokens() {
	const env = await deployStratagemsWithTestConfig();
	const [player, puller] = env.otherAccounts;
	await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
	return {env, player, puller};
}

describe('the tokens, as a table meets them', function () {
	// A table pulls its stake with `transferFrom(player, table)` under the
	// player's allowance, and pays out with `transfer`. Any address that is not
	// the world stands in for it here: what the tokens refuse is decided by the
	// address, not by its code.
	it('take a second deposit into an address paid by allowance', async function () {
		const {env, player, puller} = await loadFixture(withTokens);
		await env.TestTokens.write.approve([puller, parseEther('10')], {account: player});
		await env.TestTokens.write.transferFrom([player, puller, parseEther('5')], {account: puller});
		await env.TestTokens.write.transferFrom([player, puller, parseEther('5')], {account: puller});
		expect(await env.TestTokens.read.balanceOf([puller])).to.equal(parseEther('10'));
	});

	it('let such an address pay out to a player who has been paid before', async function () {
		const {env, player, puller} = await loadFixture(withTokens);
		await env.TestTokens.write.approve([puller, parseEther('10')], {account: player});
		await env.TestTokens.write.transferFrom([player, puller, parseEther('10')], {account: puller});
		// the player was touched by the beneficiary's transfer in the fixture
		await env.TestTokens.write.transfer([player, parseEther('3')], {account: puller});
		expect(await env.TestTokens.read.balanceOf([puller])).to.equal(parseEther('7'));
	});
});

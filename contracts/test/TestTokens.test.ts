import {expect, describe, it} from 'vitest';

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {getConnection, fetchContract} from '../utils/connection';

import artifacts from '../generated/artifacts';
import {network} from 'hardhat';
import {PermitFactory} from './eip712/permit';
import {hexToSignature, parseEther} from 'viem';

async function deployStratagems(config?: {
	startTime: bigint;
	commitPeriod: bigint;
	revealPeriod: bigint;
	maxLife: number;
}) {
	const {accounts} = await getConnection();
	const [deployer, tokensBeneficiary, ...otherAccounts] = accounts;

	const {deployments} = await loadAndExecuteDeployments(
		{
			provider: network.provider,
		},
		config,
	);

	const TestTokens = await fetchContract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
	const Stratagems = await fetchContract(deployments['Stratagems'] as Deployment<typeof artifacts.IStratagems.abi>);

	const TestTokensPermitSigner = PermitFactory.createSigner(network.provider as any, {
		chainId: 0,
		name: 'Tokens',
		verifyingContract: TestTokens.address,
	});

	return {
		TestTokensPermitSigner,
		deployer,
		tokensBeneficiary,
		Stratagems,
		TestTokens,
		config,
		otherAccounts,
	};
}

async function deployStratagemsWithDefaultConfig() {
	return deployStratagems();
}

describe('TestTokens', function () {
	describe('Deployment', function () {
		it('Should be already deployed', async function () {
			const {deployments} = await loadAndExecuteDeployments({
				provider: network.provider,
			});
			const TestTokens = await fetchContract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
			const decimals = await TestTokens.read.decimals();
			expect(decimals).to.equal(18);
		});

		it('TestTokens should have the correct number of decimals', async function () {
			const {TestTokens} = await loadFixture(deployStratagemsWithDefaultConfig);
			expect(await TestTokens.read.decimals()).to.equal(18);
		});

		it('TestTokens should let me approve allowances via Permit style signatures', async function () {
			const {TestTokens, TestTokensPermitSigner, tokensBeneficiary, otherAccounts} = await loadFixture(
				deployStratagemsWithDefaultConfig,
			);
			const owner = tokensBeneficiary;
			const spender = otherAccounts[2];
			const value = parseEther('1');
			const nonce = 0;
			const deadline = 0;
			const signature = await TestTokensPermitSigner.sign(tokensBeneficiary, {
				owner,
				spender,
				value: value.toString(),
				nonce,
				deadline,
			});
			const {v, r, s} = hexToSignature(signature);
			await TestTokens.write.permit([owner, spender, value, BigInt(deadline), Number(v), r, s], {account: spender});
			const allowance = await TestTokens.read.allowance([owner, spender]);
			expect(allowance).to.equal(value);
		});

		it('TestTokens should let me approve total allowance via Permit style signatures', async function () {
			const {TestTokens, TestTokensPermitSigner, tokensBeneficiary, otherAccounts} = await loadFixture(
				deployStratagemsWithDefaultConfig,
			);
			const owner = tokensBeneficiary;
			const spender = otherAccounts[2];
			const value = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
			const nonce = 0;
			const deadline = 0;
			const signature = await TestTokensPermitSigner.sign(tokensBeneficiary, {
				owner,
				spender,
				value: value.toString(),
				nonce,
				deadline,
			});
			const {v, r, s} = hexToSignature(signature);
			await TestTokens.write.permit([owner, spender, value, BigInt(deadline), Number(v), r, s], {account: spender});
			await TestTokens.write.transferFrom([owner, spender, parseEther('1')], {account: spender});
			const allowance = await TestTokens.read.allowance([owner, spender]);
			expect(allowance).to.equal(value);
		});

		// it('TestTokens permit fails with viem hexToSignature as it shorten remove leading zeroes', async function () {
		// 	const {TestTokens, TestTokensPermitSigner, tokensBeneficiary, otherAccounts} = await loadFixture(
		// 		deployStratagemsWithDefaultConfig,
		// 	);
		// 	const owner = tokensBeneficiary;
		// 	const spender = otherAccounts[2];
		// 	const value = parseEther('7');
		// 	const nonce = 0;
		// 	const deadline = 0;
		// 	const signature = await TestTokensPermitSigner.sign(tokensBeneficiary, {
		// 		owner,
		// 		spender,
		// 		value: value.toString(),
		// 		nonce,
		// 		deadline,
		// 	});
		// 	const {v, r, s} = hexToSignature(signature);

		// 	await expect(
		// 		TestTokens.write.permit([owner, spender, value, BigInt(deadline), Number(v), r, s], {account: spender}),
		// 	).rejects.toThrow();
		// });
	});
});

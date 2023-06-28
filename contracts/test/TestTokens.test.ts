import {expect} from './utils/viem-chai';

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {contract, getAccounts} from '../utils/viem';

import artifacts from '../generated/artifacts';
import {network} from 'hardhat';

async function deployStratagems(config?: {
	startTime: bigint;
	commitPeriod: bigint;
	resolutionPeriod: bigint;
	maxLife: number;
}) {
	const [deployer, tokensBeneficiary, ...otherAccounts] = await getAccounts();

	const {deployments} = await loadAndExecuteDeployments(
		{
			provider: network.provider as any,
		},
		config
	);

	const TestTokens = contract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
	const Stratagems = contract(deployments['Stratagems'] as Deployment<typeof artifacts.IStratagems.abi>);

	return {
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
				provider: network.provider as any,
			});
			const TestTokens = contract(deployments['TestTokens'] as Deployment<typeof artifacts.TestTokens.abi>);
			const decimals = await TestTokens.read.decimals();
			expect(decimals).to.equal(18);
		});

		it('TestTokens should have the correct number of decimals', async function () {
			const {TestTokens} = await loadFixture(deployStratagemsWithDefaultConfig);
			expect(await TestTokens.read.decimals()).to.equal(18);
		});
	});
});

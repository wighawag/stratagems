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
	const Stratagems = contract(deployments['Stratagems'] as Deployment<typeof artifacts.IStratagemsWithDebug.abi>);

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

describe('Stratagems', function () {
	it('poke on dead cell should give tokens to neighboring enemies', async function () {
		const {Stratagems} = await loadFixture(deployStratagemsWithDefaultConfig);
	});
});

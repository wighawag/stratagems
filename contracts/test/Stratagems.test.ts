import {expect} from './utils/viem-chai';

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {prefix_str} from 'stratagems-common';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {walletClient, contract, publicClient, getAccounts} from '../utils/viem';

import artifacts from '../generated/artifacts';
import {network} from 'hardhat';
import {minutes} from '../utils/time';

async function deployStratagems(config: {
	startTime: bigint;
	commitPeriod: bigint;
	resolutionPeriod: bigint;
	maxLife: number;
}) {
	const [deployer, tokensBeneficiary, ...otherAccounts] = await getAccounts();

	const tokensHash = await walletClient.deployContract({
		...artifacts.TestTokens,
		account: deployer,
		args: [tokensBeneficiary, 1000000000000000000000000000n],
	});
	const tokensReceipt = await publicClient.waitForTransactionReceipt({hash: tokensHash});
	if (!tokensReceipt.contractAddress) {
		throw new Error(`failed to deploy Tokens`);
	}
	const TestTokens = contract({address: tokensReceipt.contractAddress, abi: artifacts.TestTokens.abi});
	const decimals = await TestTokens.read.decimals();

	const hash = await walletClient.deployContract({
		...artifacts.Stratagems,
		account: deployer,
		args: [{tokens: tokensReceipt.contractAddress, decimals, ...config}],
	});

	const receipt = await publicClient.waitForTransactionReceipt({hash});

	if (!receipt.contractAddress) {
		throw new Error(`failed to deploy contract ${name}`);
	}

	return {
		Stratagems: contract({address: receipt.contractAddress, abi: artifacts.Stratagems.abi}),
		TestTokens,
		config,
		otherAccounts,
	};
}

async function deployStratagemsWithDefaultConfig() {
	const timestamp = BigInt(Math.floor(Date.now() / 1000));

	const config = {
		// startTime: nextSunday(),
		startTime: timestamp, // nextSunday(),
		// commitPeriod: days(2.5), // TODO support more complex period to support a special weekend commit period
		commitPeriod: BigInt(minutes(5)), // days(2.5), // TODO support more complex period to support a special weekend commit period
		// resolutionPeriod: days(1),
		resolutionPeriod: BigInt(minutes(5)), // days(1),
		maxLife: 5,
	};
	return deployStratagems(config);
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

		it('Should set the right prefix', async function () {
			const {TestTokens} = await loadFixture(deployStratagemsWithDefaultConfig);
			expect(await TestTokens.read.decimals()).to.equal(18);
		});

		// it('specific prefix', async function () {
		// 	const myPrefix = prefix_str('');
		// 	const {registry} = await deployGreetings(myPrefix);
		// 	expect(await registry.read.prefix()).to.equal(myPrefix);
		// });

		// it('Should be able to set message', async function () {
		// 	const {registry, otherAccounts} = await loadFixture(deployStratagemsWithDefaultConfig);
		// 	const txHash = await registry.write.setMessage(['hello', 1], {
		// 		account: otherAccounts[0],
		// 	});
		// 	expect(await publicClient.waitForTransactionReceipt({hash: txHash})).to.includeEvent(
		// 		registry.abi,
		// 		'MessageChanged'
		// 	);
		// });

		// it('Should not be able to set message for other account', async function () {
		// 	const {registry, otherAccounts} = await loadFixture(deployStratagemsWithDefaultConfig);
		// 	await expect(
		// 		registry.write.setMessageFor([otherAccounts[1], 'hello', 1], {
		// 			account: otherAccounts[0],
		// 		})
		// 	).to.be.revertedWith('NOT_AUTHORIZED');
		// });
	});
});

import {expect, describe, it} from 'vitest';
import './utils/viem-matchers';

import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {Deployment, loadAndExecuteDeployments} from 'rocketh';

import {getConnection, fetchContract} from '../utils/connection';

import artifacts from '../generated/artifacts';
import {network} from 'hardhat';
import {PermitFactory} from './eip712/permit';
import {getContract, hexToSignature, parseEther} from 'viem';
import {bigIntIDToXY, xyToBigIntID} from 'stratagems-common';

async function deployTestPositionUtils() {
	const {accounts, walletClient, publicClient} = await getConnection();
	const [deployer, ...otherAccounts] = accounts;

	const deploymentHash = await walletClient.deployContract({
		...artifacts.TestPositionUtils,
		account: deployer,
	});

	const receipt = await publicClient.getTransactionReceipt({hash: deploymentHash});
	const TestPositionUtils = getContract({
		...artifacts.TestPositionUtils,
		address: receipt.contractAddress as `0x${string}`,
		publicClient,
		walletClient,
	});

	return {
		TestPositionUtils,
		deployer,
		otherAccounts,
	};
}

describe('TestPositionUtils', function () {
	it('positive x and y', async function () {
		const num = {x: 4, y: 1002};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const [x, y] = await TestPositionUtils.read.toXY([pos]);
		expect(x).to.equal(num.x);
		expect(y).to.equal(num.y);
	});

	it('negative x', async function () {
		const num = {x: -4, y: 1002};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const [x, y] = await TestPositionUtils.read.toXY([pos]);
		expect(x).to.equal(num.x);
		expect(y).to.equal(num.y);
	});

	it('negative y', async function () {
		const num = {x: 4, y: -1002};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const [x, y] = await TestPositionUtils.read.toXY([pos]);
		expect(x).to.equal(num.x);
		expect(y).to.equal(num.y);
	});

	it('negative x and y', async function () {
		const num = {x: -4, y: -1002};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const [x, y] = await TestPositionUtils.read.toXY([pos]);
		expect(x).to.equal(num.x);
		expect(y).to.equal(num.y);
	});

	it('positive x and y + positive offset', async function () {
		const num = {x: 4, y: 1002};
		const offset = {x: 999, y: 11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});

	it('positive x and y + negative x offset', async function () {
		const num = {x: 4, y: 1002};
		const offset = {x: -999, y: 11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});
	it('positive x and y + negative y offset', async function () {
		const num = {x: 4, y: 1002};
		const offset = {x: 999, y: -11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});
	it('positive x and y + negative x/y offset', async function () {
		const num = {x: 4, y: 1002};
		const offset = {x: -999, y: -11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});

	it('negative x and y + positive offset', async function () {
		const num = {x: -4, y: -1002};
		const offset = {x: 999, y: 11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});

	it('negative x and y + negative x offset', async function () {
		const num = {x: -4, y: -1002};
		const offset = {x: -999, y: 11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});
	it('negative x and y + negative y offset', async function () {
		const num = {x: -4, y: -1002};
		const offset = {x: 999, y: -11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});
	it('negative x and y + negative x/y offset', async function () {
		const num = {x: -4, y: -1002};
		const offset = {x: -999, y: -11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});
});

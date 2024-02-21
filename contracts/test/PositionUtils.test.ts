import {expect, describe, it} from 'vitest';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {getConnection, fetchContract} from '../utils/connection';
import artifacts from '../generated/artifacts';
import {bigIntIDToXY, xyToBigIntID} from 'stratagems-common';

async function deployTestPositionUtils() {
	const {accounts, walletClient, publicClient} = await getConnection();
	const [deployer, ...otherAccounts] = accounts;

	const deploymentHash = await walletClient.deployContract({
		...artifacts.TestPositionUtils,
		account: deployer,
	});

	const receipt = await publicClient.getTransactionReceipt({hash: deploymentHash});
	const TestPositionUtils = await fetchContract({
		...artifacts.TestPositionUtils,
		address: receipt.contractAddress as `0x${string}`,
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

	it('max x and negative offset', async function () {
		const num = {x: 2_147_483_647, y: -1002};
		const offset = {x: -999, y: -11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});
	// it('max x and positive offset should fail', async function () {
	// 	const num = {x: 2_147_483_647, y: -1002};
	// 	const offset = {x: 1, y: -11};
	// 	const pos = xyToBigIntID(num.x, num.y);
	// 	const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
	// 	const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
	// 	const {x, y} = bigIntIDToXY(newPos);
	// 	expect(x).to.equal(num.x + offset.x);
	// 	expect(y).to.equal(num.y + offset.y);
	// });

	it('offset result in max positive', async function () {
		const num = {x: 2_147_483_645, y: -1002};
		const offset = {x: 2, y: -11};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});

	it('offset result in max negative', async function () {
		const num = {x: -2_147_483_645, y: -1003};
		const offset = {x: -3, y: -2_147_482_645};
		const pos = xyToBigIntID(num.x, num.y);
		const {TestPositionUtils} = await loadFixture(deployTestPositionUtils);
		const newPos = await TestPositionUtils.read.offset([pos, offset.x, offset.y]);
		const {x, y} = bigIntIDToXY(newPos);
		console.log({newPos: newPos.toString(16), x, y});
		expect(x).to.equal(num.x + offset.x);
		expect(y).to.equal(num.y + offset.y);
	});
});

import {expect} from './chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {IERC20} from '../typechain';
import {setupUser, setupUsers} from './utils/users';

const setup = deployments.createFixture(async () => {
	await deployments.fixture('Tokens');
	const {tokensBeneficiary} = await getNamedAccounts();
	const contracts = {
		Tokens: <IERC20>await ethers.getContract('Tokens'),
	};
	const users = await setupUsers(await getUnnamedAccounts(), contracts);
	return {
		...contracts,
		users,
		tokensBeneficiary: await setupUser(tokensBeneficiary, contracts),
	};
});

describe('Tokens', function () {
	it('transfer fails', async function () {
		const {users} = await setup();
		await expect(users[0].Tokens.transfer(users[1].address, 1)).to.be.revertedWith('NOT_ENOUGH_TOKENS');
	});

	it('transfer succeed', async function () {
		const {users, tokensBeneficiary, Tokens} = await setup();
		await tokensBeneficiary.Tokens.transfer(users[1].address, 1);

		await expect(tokensBeneficiary.Tokens.transfer(users[1].address, 1))
			.to.emit(Tokens, 'Transfer')
			.withArgs(tokensBeneficiary.address, users[1].address, 1);
	});
});

import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {Tokens, Dummy} from '../../typechain';
import {setupUser, setupUsers} from '../utils/users';
import {ERC2612SignerFactory} from '../utils/eip712-signers';
import {parseEther} from 'ethers/lib/utils';

export const setup = deployments.createFixture(async () => {
	await deployments.fixture('Dummy');
	const contracts = {
		Dummy: <Dummy>await ethers.getContract('Dummy'),
		Tokens: <Tokens>await ethers.getContract('Tokens'),
	};
	const TokensPermit = await ERC2612SignerFactory.createSignerFactory(contracts.Tokens);

	const users = await setupUsers(await getUnnamedAccounts(), contracts, {TokensPermit});
	const {tokensBeneficiary} = await getNamedAccounts();
	const tokensBeneficiaryUser = await setupUser(tokensBeneficiary, contracts);
	await tokensBeneficiaryUser.Tokens.transfer(users[0].address, parseEther('10'));
	await tokensBeneficiaryUser.Tokens.transfer(users[1].address, parseEther('10'));
	await tokensBeneficiaryUser.Tokens.transfer(users[2].address, parseEther('10'));

	return {
		...contracts,
		users,
		linkedData: (await deployments.get('Dummy')).linkedData,
	};
});

export type Setup = Awaited<ReturnType<typeof setup>>;

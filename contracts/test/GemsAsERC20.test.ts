import {erc20, runtests} from 'ethereum-contracts-test-suite';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {describe, it} from 'vitest';

type Fixture = {
	ethereum: any; // TODO
	contractAddress: string;
	users: string[];
	userWithToken: string;
};

async function setupGems(): Promise<Fixture> {
	const setup = await loadFixture(deployStratagemsWithTestConfig);
	return {
		ethereum: setup.provider,
		contractAddress: setup.Gems.address,
		users: setup.otherAccounts,
		userWithToken: setup.tokensBeneficiary,
	};
}

const tests = erc20.generateTests({EIP717: true}, setupGems);

describe('Gems as ERC20', function () {
	runtests(tests, {describe, it});
});

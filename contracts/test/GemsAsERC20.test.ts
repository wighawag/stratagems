import {erc20} from 'ethereum-contracts-test-suite';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {describe, it} from 'vitest';
import {TestToRun} from 'ethereum-contracts-test-suite/dist/src/testsuite';

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

const tests = erc20.generateTests(setupGems);

function recurse(test: TestToRun) {
	if (test.subTests) {
		describe(test.title, function () {
			if (test.subTests) {
				for (const subTest of test.subTests) {
					recurse(subTest);
				}
			}
		});
	} else {
		it(test.title, test.test);
	}
}
describe('Gems as ERC20', function () {
	it.each(tests)(`$title`, async (test) => {
		recurse(test);
	});
});

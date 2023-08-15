import {deployStratagemsWithTestConfig} from './utils/stratagems-test';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {describe, it} from 'vitest';
import {erc721, runtests} from 'ethereum-contracts-test-suite';
import {xyToBigIntID} from 'stratagems-common';

type Fixture = {
	ethereum: any; // TODO
	contractAddress: string;
	users: string[];
	deployer: string;
	mint(to: string): Promise<{hash: string; tokenId: string}>;
};

async function setupStratagems(): Promise<Fixture> {
	const setup = await loadFixture(deployStratagemsWithTestConfig);

	let count = 0;
	async function mint(to: string) {
		const tokenID = xyToBigIntID(2, 3 + count);
		const hash = await setup.Stratagems.write.forceSimpleCells(
			[
				[
					{
						position: tokenID,
						owner: to as `0x${string}`,
						color: 5,
						life: 2,
					},
				],
			],
			{account: setup.deployer}
		);
		return {hash, tokenId: tokenID.toString()};
	}
	return {
		ethereum: setup.provider,
		contractAddress: setup.Stratagems.address,
		users: setup.otherAccounts,
		deployer: setup.deployer,
		mint,
	};
}

const tests = erc721.generateTests(setupStratagems);

describe.skip('Stratagems as ERC721', function () {
	runtests(tests, {describe, it});
});

import {expect} from '../chai-setup';
import {ethers, deployments, getUnnamedAccounts, getNamedAccounts} from 'hardhat';
import {Tokens, Game} from '../../typechain';
import {setupUser, setupUsers} from '../utils/users';
import {setTimestamp} from '../utils/time';
import {nextSunday} from '../../utils/time';
import {defaultAbiCoder, keccak256, ParamType, parseEther, splitSignature} from 'ethers/lib/utils';
import {BigNumberish, constants} from 'ethers';
import {ERC2612SignerFactory} from '../utils/eip712-signers';

export const CommitmentHashZero = '0x000000000000000000000000000000000000000000000000';

export const setup = deployments.createFixture(async () => {
	await deployments.fixture('Game');
	await setTimestamp(nextSunday());
	const contracts = {
		Game: <Game>await ethers.getContract('Game'),
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
		linkedData: (await deployments.get('Game')).linkedData,
	};
});

export type Setup = Awaited<ReturnType<typeof setup>>;

export function expectCellToEqual(
	cell: any[],
	expectedCell: {
		owner: string;
		lastPeriodUpdate: number;
		periodWhenTokenIsAdded: number;
		color: number; //0 | 1 | 2 | 3 | 4;
		life: number;
		delta: number;
		enemymask: number;
	}
) {
	const transformedCell = {
		owner: cell[0],
		lastPeriodUpdate: cell[1],
		periodWhenTokenIsAdded: cell[2],
		color: cell[3],
		life: cell[4],
		delta: cell[5],
		enemymask: cell[6],
	};
	// expect(transformedCell).to.eq(expectedCell);

	for (const field of Object.keys(expectedCell)) {
		expect(
			(transformedCell as any)[field],
			`${field} not matching, got ${(transformedCell as any)[field]}, expected ${(expectedCell as any)[field]}`
		).to.equals((expectedCell as any)[field]);
	}
}

export async function composeCommitment(
	game: Game,
	{
		numTokensToAddToReserve,
		moves,
		permit,
		commitmentHash,
		secret,
	}: {
		numTokensToAddToReserve: BigNumberish;
		moves: any[];
		secret?: string;
		commitmentHash?: string;
		permit?: {value: BigNumberish; deadline: BigNumberish; r: string; s: string; v: number};
	}
) {
	secret = secret || '0x0000000000000000000000000000000000000000000000000000000000000000'; // TODO random
	if (!commitmentHash) {
		commitmentHash = keccak256(
			defaultAbiCoder.encode(
				[
					'bytes32',
					ParamType.from({
						type: 'tuple[]',
						components: [
							{
								name: 'position',
								type: 'uint64',
							},
							{
								name: 'color',
								type: 'uint8',
							},
						],
					}),
				],
				[secret, moves]
			)
		);
		commitmentHash = commitmentHash.slice(0, 50);
		// const numNibbles = commitmentHash.length - 2;
		// const cut = Math.max(0, numNibbles - 48);
		// commitmentHash = '0x' + commitmentHash.slice(2 + cut).padStart(48, '0');
		// if (!commitmentHash) {
		// 	throw new Error(`could not generated commitmentHash from secret and data`);
		// }
		// console.log({commitmentHash});
	}

	const commitmentHashToUse = commitmentHash;
	return {
		secret,
		perform: () =>
			game.makeCommitmentWithExtraReserve(
				commitmentHashToUse,
				numTokensToAddToReserve,
				permit || {
					value: 0,
					deadline: 0,
					v: 0,
					r: constants.HashZero,
					s: constants.HashZero,
				}
			),
		hash: commitmentHash,
		moves: moves,
	};
}

export async function composeCommitmentByUserIndex(
	{users, Game}: Pick<Setup, 'Game' | 'users'>,
	userIndex: number,
	{
		numTokensToAddToReserve,
		commitmentHash,
		moves,
	}: {numTokensToAddToReserve: BigNumberish; moves: any[]; commitmentHash?: string}
) {
	const signature = splitSignature(
		await users[userIndex].TokensPermit.sign({
			owner: users[userIndex].address,
			spender: Game.address,
			value: numTokensToAddToReserve,
			nonce: 0,
			deadline: constants.MaxUint256,
		})
	);

	return composeCommitment(Game.connect(users[userIndex].signer), {
		numTokensToAddToReserve,
		commitmentHash,
		moves,
		permit: {
			value: numTokensToAddToReserve,
			deadline: constants.MaxUint256,
			r: signature.r,
			s: signature.s,
			v: signature.v,
		},
	});
}

export function composeResolution(game: Game, {player, moves, secret}: {player: string; moves: any[]; secret: string}) {
	return {perform: () => game.functions.resolve(player, secret, moves, CommitmentHashZero)}; // TODO furtherMoves
}

export function composeResolutionByUserIndex(
	{users}: Pick<Awaited<ReturnType<typeof setup>>, 'users'>,
	userIndex: number,
	{moves, secret}: {moves: any[]; secret: string}
) {
	return composeResolution(users[userIndex].Game, {player: users[userIndex].address, moves, secret});
}

import {encodeAbiParameters, keccak256} from 'viem';
import type {ContractMove} from './types';
import * as crypto from 'crypto';

export type Commitment = {
	hash: `0x${string}`;
	secret: `0x${string}`;
	moves: ContractMove[];
};

export function randomSecret() {
	return (`0x` +
		[...crypto.getRandomValues(new Uint8Array(32))]
			.map((m) => ('0' + m.toString(16)).slice(-2))
			.join('')) as `0x${string}`;
}

// TODO support furtherMoves
export function prepareCommitment(moves: ContractMove[], secret: `0x${string}`) {
	const commitmentHash = keccak256(
		encodeAbiParameters(
			[
				{type: 'bytes32', name: 'secret'},
				{
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
					name: 'moves',
					type: 'tuple[]',
				},
			],
			[secret, moves],
		),
	).slice(0, 50) as `0x${string}`;

	return {secret, hash: commitmentHash, moves};
}

import {encodeAbiParameters, keccak256} from 'viem';
import type {ContractMove} from './types';
import {zeroBytes24} from './constants';
import * as crypto from 'crypto';

export type Commitment = {
	hash: `0x${string}`;
	secret: `0x${string}`;
	moves: ContractMove[];
	furtherActions: `0x${string}`;
};

export function randomSecret() {
	return (`0x` +
		[...crypto.getRandomValues(new Uint8Array(32))]
			.map((m) => ('0' + m.toString(16)).slice(-2))
			.join('')) as `0x${string}`;
}

/**
 * The commitment to one chunk of moves, in the commit-reveal base's one encoding:
 * `bytes24(keccak256(abi.encode(secret, moves, furtherActions)))`, `furtherActions`
 * being the hash of the next chunk, or zero for the last (alpha1 dropped it from
 * the last chunk's encoding; the base never does).
 */
export function prepareCommitment(
	moves: ContractMove[],
	secret: `0x${string}`,
	furtherActions: `0x${string}` = zeroBytes24,
): Commitment {
	const commitmentHash = keccak256(
		encodeAbiParameters(
			[
				{type: 'bytes32', name: 'secret'},
				{
					components: [
						{name: 'position', type: 'uint64'},
						{name: 'color', type: 'uint8'},
					],
					name: 'moves',
					type: 'tuple[]',
				},
				{type: 'bytes24', name: 'furtherActions'},
			],
			[secret, moves, furtherActions],
		),
	).slice(0, 50) as `0x${string}`;

	return {secret, hash: commitmentHash, moves, furtherActions};
}

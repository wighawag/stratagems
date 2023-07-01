import {Color} from './stratagems';

export type Commitment = {
	hash: `0x${string}`;
	secret: `0x${string}`;
	moves: {position: bigint; color: Color}[];
};

export function prepareCommitment(): Commitment {
	return {
		hash: `0x`,
		secret: `0x`,
		moves: [{position: 0n, color: Color.Blue}],
	};
}

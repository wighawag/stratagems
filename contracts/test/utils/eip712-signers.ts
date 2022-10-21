import {EIP712SignerFactory} from './eip712';

export const ERC2612SignerFactory = new EIP712SignerFactory({
	Permit: [
		{
			name: 'owner',
			type: 'address',
		},
		{
			name: 'spender',
			type: 'address',
		},
		{
			name: 'value',
			type: 'uint256',
		},
		{
			name: 'nonce',
			type: 'uint256',
		},
		{
			name: 'deadline',
			type: 'uint256',
		},
	],
});

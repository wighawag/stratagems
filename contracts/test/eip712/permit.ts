import {EIP712SignerFactory} from '.';

export const PermitFactory = new EIP712SignerFactory({
	domain: {},
	types: {
		Permit: [
			{name: 'owner', type: 'address'},
			{name: 'spender', type: 'address'},
			{name: 'value', type: 'uint256'},
			{name: 'nonce', type: 'uint256'},
			{name: 'deadline', type: 'uint256'},
		],
	},
	primaryType: 'Permit',
});

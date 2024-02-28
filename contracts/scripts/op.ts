import {EIP1193GenericRequestProvider} from 'eip-1193';
import {decodeFunctionResult, encodeFunctionData} from 'viem';

const abi = [
	{
		inputs: [],
		name: 'l1BaseFee',
		outputs: [{internalType: 'uint256', name: '', type: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{internalType: 'bytes', name: '_data', type: 'bytes'}],
		name: 'getL1Fee',
		outputs: [{internalType: 'uint256', name: '', type: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{internalType: 'bytes', name: '_data', type: 'bytes'}],
		name: 'getL1GasUsed',
		outputs: [{internalType: 'uint256', name: '', type: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'gasPrice',
		outputs: [{internalType: 'uint256', name: '', type: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'baseFee',
		outputs: [{internalType: 'uint256', name: '', type: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
];

export async function call(
	provider: EIP1193GenericRequestProvider,
	functionName: string,
	...args: any[]
): Promise<bigint> {
	const data = encodeFunctionData({
		abi,
		functionName,
		args,
	});
	const result = (await provider.request({
		method: 'eth_call',
		params: [
			{
				to: '0x420000000000000000000000000000000000000F',
				data,
			},
		],
	})) as `0x${string}`;
	const parsed = decodeFunctionResult({
		abi,
		functionName,
		data: result,
	}) as bigint;

	return parsed;
}

export function getL1BaseFee(provider: EIP1193GenericRequestProvider): Promise<bigint> {
	return call(provider, 'l1BaseFee');
}
export function getL1Fee(provider: EIP1193GenericRequestProvider, data: `0x${string}`): Promise<bigint> {
	return call(provider, 'getL1Fee', data);
}
export function getL1GasUsed(provider: EIP1193GenericRequestProvider, data: `0x${string}`): Promise<bigint> {
	return call(provider, 'getL1GasUsed', data);
}
export function getGasPrice(provider: EIP1193GenericRequestProvider): Promise<bigint> {
	return call(provider, 'gasPrice');
}
export function getBaseFee(provider: EIP1193GenericRequestProvider): Promise<bigint> {
	return call(provider, 'baseFee');
}

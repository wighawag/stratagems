import {Provider} from '@ethersproject/abstract-provider';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {BigNumberish, Contract, TypedDataDomain, TypedDataField} from 'ethers';
import {Interface} from 'ethers/lib/utils';

const fieldNames = ['name', 'version', 'chainId', 'verifyingContract', 'salt'];

/** Builds a domain object based on the values obtained by calling `eip712Domain()` in a contract. */
function buildDomain(
	fields: number,
	name: string,
	version: string,
	chainId: BigNumberish,
	verifyingContract: string,
	salt: string,
	extensions: BigNumberish[]
): TypedDataDomain {
	if (extensions.length > 0) {
		throw Error('extensions not implemented');
	}

	const domain: TypedDataDomain = {name, version, chainId, verifyingContract, salt};

	for (const [i, field] of fieldNames.entries()) {
		if (!(fields & (1 << i))) {
			delete (domain as any)[field];
		}
	}

	return domain;
}

export type EIP712UserSignerFactory = {
	createSigner: (user: {signer: SignerWithAddress}) => EIP712UserSigner;
};

export type EIP712UserSigner = {
	sign: (value: Record<string, any>) => Promise<string>;
};

export class EIP712SignerFactory {
	constructor(private types: Record<string, Array<TypedDataField>>) {}

	async createSignerFactory(
		contractAddressOrDomain: {address: string; provider: Provider} | Contract | TypedDataDomain
	): Promise<EIP712UserSignerFactory> {
		const types = this.types;

		let domainToUse: TypedDataDomain;
		if (contractAddressOrDomain instanceof Contract) {
			const domainData: [number, string, string, BigNumberish, string, string, BigNumberish[]] =
				await contractAddressOrDomain.callStatic['eip712Domain']();
			domainToUse = buildDomain(...domainData);
		} else if ('address' in contractAddressOrDomain && 'provider' in contractAddressOrDomain) {
			const iface = new Interface([
				'function eip712Domain() view returns (bytes1,string,string,uint256,address,bytes32,uint256[])',
			]);
			// const rawCallResult = await this.provider.call({to: contractAddressOrDomain, data: '0x'});
			// const domainData = defaultAbiCoder.decode(
			// 	['bytes1', 'string', 'string', 'uint256', 'address', 'bytes32', 'uint256[]'],
			// 	rawCallResult
			// ) as [number, string, string, BigNumberish, string, string, BigNumberish[]];
			const data = iface.encodeFunctionData('eip712Domain');
			const rawCallResult = await contractAddressOrDomain.provider.call({
				to: contractAddressOrDomain.address,
				data,
			});
			const domainData = iface.decodeFunctionResult('eip712Domain', rawCallResult) as [
				number,
				string,
				string,
				BigNumberish,
				string,
				string,
				BigNumberish[]
			];
			domainToUse = buildDomain(...domainData);
		} else {
			domainToUse = contractAddressOrDomain;
		}

		return {
			createSigner(user: {signer: SignerWithAddress}): EIP712UserSigner {
				return {
					async sign(value: Record<string, any>) {
						if (domainToUse.chainId === 0) {
							domainToUse.chainId = await user.signer.getChainId();
						}
						return user.signer._signTypedData(domainToUse, types, value);
					},
				};
			},
		};
	}
}

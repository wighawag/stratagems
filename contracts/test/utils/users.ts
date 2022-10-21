import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {Contract, TypedDataDomain, TypedDataField} from 'ethers';
import {ethers} from 'hardhat';
import {EIP712UserSigner, EIP712UserSignerFactory} from './eip712';

export async function setupUsers<
	T extends {[contractName: string]: Contract},
	S extends {[signerName: string]: EIP712UserSigner}
>(
	addresses: string[],
	contracts: T,
	signers?: {[signerName: string]: EIP712UserSignerFactory}
): Promise<({address: string; signer: SignerWithAddress} & T & S)[]> {
	const users: ({address: string; signer: SignerWithAddress} & T & S)[] = [];
	for (const address of addresses) {
		users.push((await setupUser(address, contracts, signers)) as any);
	}
	return users;
}

export async function setupUser<
	T extends {[contractName: string]: Contract},
	S extends {[signerName: string]: EIP712UserSigner}
>(
	address: string,
	contracts: T,
	signers?: {[signerName: string]: EIP712UserSignerFactory}
): Promise<{address: string; signer: SignerWithAddress} & T & S> {
	const signer = await ethers.getSigner(address);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const user: any = {address, signer};
	for (const key of Object.keys(contracts)) {
		user[key] = contracts[key].connect(signer);
	}
	if (signers) {
		for (const key of Object.keys(signers)) {
			user[key] = signers[key].createSigner(user);
		}
	}

	return user as {address: string; signer: SignerWithAddress} & T & S;
}

export class EIP712Signer {
	constructor(private domain: TypedDataDomain, private types: Record<string, Array<TypedDataField>>) {}

	sign(
		user: {signer: SignerWithAddress},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		value: Record<string, any>
	): Promise<string> {
		return user.signer._signTypedData(this.domain, this.types, value);
	}
}

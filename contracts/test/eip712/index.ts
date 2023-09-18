import {EIP1193ChainIdProvider, EIP1193PTypedSignv4Provider} from 'eip-1193';

export type EIP712Domain = {
	chainId?: number | undefined;
	name?: string | undefined;
	salt?: `0x${string}` | undefined;
	verifyingContract?: `0x${string}` | undefined;
	version?: string | undefined;
};
export type EIP712Field = {name: string; type: string};

export type EIP712MessageContext = {
	domain: EIP712Domain;
	types: Record<string, EIP712Field[]>;
	primaryType: string;
};

export type EIP712FullMessage = EIP712MessageContext & {
	message: Record<string, any>;
};

export class EIP712Signer {
	constructor(private context: EIP712MessageContext) {}

	sign(provider: EIP1193PTypedSignv4Provider, account: `0x${string}`, message: Record<string, any>): Promise<string> {
		return provider.request({method: 'eth_signTypedData_v4', params: [account, {...this.context, message: message}]});
	}
}

export class EIP712SignerFactory {
	constructor(private context: EIP712MessageContext) {}

	createSigner(
		provider: EIP1193PTypedSignv4Provider,
		domain: EIP712Domain,
	): {
		sign: (account: `0x${string}`, message: Record<string, any>) => Promise<`0x${string}`>;
	} {
		const domainToUse = Object.assign(this.context.domain, domain);
		const primaryType = this.context.primaryType;
		const context = this.context;
		return {
			async sign(account: `0x${string}`, message: Record<string, any>): Promise<`0x${string}`> {
				if (domainToUse.chainId === 0) {
					domainToUse.chainId = parseInt(
						(await (provider as unknown as EIP1193ChainIdProvider).request({method: 'eth_chainId'})).slice(2),
						16,
					);
				}

				const types = {...context.types};
				const domainTypes: {name: string; type: string}[] = [];
				if (domainToUse.name) {
					domainTypes.push({
						name: 'name',
						type: 'string',
					});
				}
				if (domainToUse.chainId) {
					domainTypes.push({
						name: 'chainId',
						type: 'uint256',
					});
				}
				if (domainToUse.verifyingContract) {
					domainTypes.push({
						name: 'verifyingContract',
						type: 'address',
					});
				}
				// TODO more
				types['EIP712Domain'] = domainTypes;

				// console.log(JSON.stringify({domain: domainToUse, types, primaryType, message}, null, 2));
				return provider.request({
					method: 'eth_signTypedData_v4',
					params: [account, {domain: domainToUse, types, primaryType, message}],
				});
			},
		};
	}
}

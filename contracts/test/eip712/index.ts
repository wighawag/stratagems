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

	createSigner(domain: EIP712Domain): {
		sign: (
			provider: EIP1193PTypedSignv4Provider,
			account: `0x${string}`,
			message: Record<string, any>,
		) => Promise<string>;
	} {
		const domainToUse = Object.assign(this.context.domain, domain);
		const types = this.context.types;
		const primaryType = this.context.primaryType;
		return {
			async sign(
				provider: EIP1193PTypedSignv4Provider,
				account: `0x${string}`,
				message: Record<string, any>,
			): Promise<string> {
				if (domainToUse.chainId === 0) {
					domainToUse.chainId = parseInt(
						(await (provider as unknown as EIP1193ChainIdProvider).request({method: 'eth_chainId'})).slice(2),
						16,
					);
				}

				return provider.request({
					method: 'eth_signTypedData_v4',
					params: [account, {...this.context, message: message}],
				});
			},
		};
	}
}

import type {OnChainActions} from '$lib/account/base';

export function getTransactionToReveal($onchainActions: OnChainActions<unknown>) {
	console.log($onchainActions);
	const toReveal = Object.keys($onchainActions)
		.map((k: string) => ({action: $onchainActions[k as `0x${string}`], hash: k as `0x${string}`}))
		.filter((v) => !v.action.revealTx)
		.sort(
			(a, b) =>
				(b.action.tx.nonce ? Number(BigInt(b.action.tx.nonce)) : 0) -
				(a.action.tx.nonce ? Number(BigInt(a.action.tx.nonce)) : 0),
		);
	return toReveal;
}

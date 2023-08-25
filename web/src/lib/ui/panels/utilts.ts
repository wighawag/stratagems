import type {OnChainActions} from '$lib/web3/account-data';

export function getTransactionToReveal($onchainActions: OnChainActions) {
	console.log($onchainActions);
	const toResolve = Object.keys($onchainActions)
		.map((k: string) => $onchainActions[k as `0x${string}`])
		.filter((v) => !v.revealTx)
		.sort((a, b) => (b.tx.nonce ? Number(BigInt(b.tx.nonce)) : 0) - (a.tx.nonce ? Number(BigInt(a.tx.nonce)) : 0));
	return toResolve;
}

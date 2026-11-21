import {createPublicClient, custom} from 'viem';
import type {EmbeddedWorld} from '$lib/embedded';

/**
 * The world's chain as viem wants it, for the clients the world's own loops
 * build (the revealer, the handover's reader, the played seats' strategy). Read
 * off the world's records, so it is the chain the deploy ran on.
 */
export function worldChain(world: Pick<EmbeddedWorld, 'deployments'>) {
	const records = world.deployments.get();
	return {
		id: records.chain.id,
		name: records.chain.name,
		nativeCurrency: records.chain.nativeCurrency,
		rpcUrls: {default: {http: [] as string[]}},
	};
}

/** A client that reads the world's chain, over the world's own provider. */
export function worldReader(
	world: Pick<EmbeddedWorld, 'deployments' | 'provider'>,
) {
	return createPublicClient({
		chain: worldChain(world),
		transport: custom(world.provider as never),
	});
}

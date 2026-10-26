/**
 * A PROVIDER WHOSE LOGS CARRY THEIR BLOCK'S TIMESTAMP, for a node that does not
 * put it there.
 *
 * etherfold reads each log's `blockTimestamp` (execution-apis#639: geth 1.16+,
 * reth, besu, erigon, anvil and Hardhat's EDR 0.20+ all put it on the log) and
 * REFUSES a log without one (`TimestamplessLogError`) rather than guessing a time.
 * webevm, the chain the offline world runs in the tab, does not (measured on
 * 0.6.0, and absent from 0.7.0 and 0.8.0 too, 2026-10-27, step O of
 * work/plans/join-template-commit-reveal.md), so the world's indexer would fold
 * nothing. This fills it in from the block, once per block a `getLogs` answer
 * names, and passes every other request through untouched.
 *
 * Only the world's indexer is handed it: a remote node is one etherfold already
 * accepts, and a node that does carry the field keeps its own value here.
 */
import type {EIP1193ProviderLike} from '$lib/embedded/types';

type Log = {blockHash?: string | null; blockTimestamp?: string | null};

export function withLogTimestamps<P extends EIP1193ProviderLike>(
	provider: P,
): P {
	const timestamps = new Map<string, Promise<string>>();

	function timestampOf(blockHash: string): Promise<string> {
		let known = timestamps.get(blockHash);
		if (!known) {
			known = provider
				.request({method: 'eth_getBlockByHash', params: [blockHash, false]})
				.then((block) => {
					const timestamp = (block as {timestamp?: string} | null)?.timestamp;
					if (!timestamp) throw new Error(`no block ${blockHash}`);
					return timestamp;
				});
			known.catch(() => timestamps.delete(blockHash));
			timestamps.set(blockHash, known);
			if (timestamps.size > 256) {
				const oldest = timestamps.keys().next().value;
				if (oldest !== undefined) timestamps.delete(oldest);
			}
		}
		return known;
	}

	return {
		...provider,
		async request(args: {method: string; params?: unknown}) {
			const answer = await provider.request(args);
			if (args.method !== 'eth_getLogs' || !Array.isArray(answer)) {
				return answer;
			}
			return Promise.all(
				(answer as Log[]).map(async (log) =>
					log.blockTimestamp || !log.blockHash
						? log
						: {...log, blockTimestamp: await timestampOf(log.blockHash)},
				),
			);
		},
	} as P;
}

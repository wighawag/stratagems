/**
 * WHAT is indexed, built in ONE place for both of its users: the snapshot job
 * (`scripts/index.ts`, handing it to `etherfold build` as `INDEXING_SOURCE`) and the
 * web app (handing it to its worker host). A publication is keyed by the digest of
 * the source and the stream config (etherfold ADR-0095), so a tab only finds the
 * job's snapshot when both built this exact value: the same contracts, the same
 * ABI entries in the same order, the same start blocks, the same finality.
 */
import {stratagemsProcessor} from './processor.js';

/**
 * The stream's finality, in blocks: how far below the tip a block is taken as
 * final. `etherfold build --publish` cuts its snapshot at `tip - finality`, and the
 * tab must run with the same number (it is hashed into the stream digest). The
 * snapshot job passes it as `STREAM_FINALITY`, the web app as
 * `config.stream.finality`, both from here.
 */
export const STREAM_FINALITY = 12;

/** The contracts whose events the processor folds, by their deployment name. */
export const INDEXED_CONTRACTS = ['Stratagems', 'GemsGenerator'] as const;

type AbiEntry = {readonly type: string; readonly name?: string};

type ContractInfo = {readonly abi: readonly AbiEntry[]; readonly address: `0x${string}`; readonly startBlock?: number};

/** What `rocketh-export` writes (rocketh 0.19+), as far as the source reads it. */
export type ContractsInfo = {
	readonly chain: {readonly id: number; readonly genesisHash?: string};
	readonly contracts: {readonly [name: string]: ContractInfo};
};

export type StratagemsIndexingSource = {
	chainId: string;
	genesisHash?: `0x${string}`;
	contracts: {abi: AbiEntry[]; address: `0x${string}`; startBlock?: number}[];
};

/** The events the processor has a handler for: `onCommitmentMade` folds `CommitmentMade`. */
function handled(entry: AbiEntry): boolean {
	return (
		entry.type === 'event' &&
		entry.name !== undefined &&
		typeof (stratagemsProcessor as unknown as Record<string, unknown>)[`on${entry.name}`] === 'function'
	);
}

/**
 * The indexing source for a deployment's `contracts.ts` (what `rocketh-export`
 * writes).
 *
 * Only `Stratagems` and `GemsGenerator` are indexed, and of each only the events a
 * handler folds. The old processor was handed every contract of the deployment and
 * ignored every event it had no handler for (`Transfer`, `Approval`,
 * `MoveProcessed`, ...), so leaving those out changes no answer and fetches and
 * stores a third fewer logs. The oracle comparison
 * (`oracle/2026-09-29-alpha1/`) is what says it changes no answer.
 */
export function indexingSource(info: ContractsInfo): StratagemsIndexingSource {
	return {
		// a decimal string, as the export wrote it before rocketh 0.19: the source is part of
		// the stream digest a publication is found by, so its shape must not move
		chainId: String(info.chain.id),
		...(info.chain.genesisHash ? {genesisHash: info.chain.genesisHash as `0x${string}`} : {}),
		contracts: INDEXED_CONTRACTS.map((name) => {
			const contract = info.contracts[name];
			if (!contract) {
				throw new Error(`the deployment has no ${name} contract, which the stratagems processor indexes`);
			}
			return {
				abi: contract.abi.filter(handled).map((entry) => ({...entry})),
				address: contract.address,
				...(contract.startBlock !== undefined ? {startBlock: contract.startBlock} : {}),
			};
		}),
	};
}

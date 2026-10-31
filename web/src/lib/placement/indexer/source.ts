/**
 * WHAT the reference game's indexer folds: the Game contract, and of its ABI
 * only the events `./processor.ts` has a handler for. The source is part of the
 * stream's digest, so it is built in this one place.
 */
import {placementProcessor} from './processor';

/**
 * The stream's finality, in blocks: how far below the tip a block is taken as
 * final. It does not delay the fold (the head is folded too, and rolled back
 * on a reorg); it bounds the reorg window a store keeps history for.
 */
export const STREAM_FINALITY = 12;

type AbiEntry = {readonly type: string; readonly name?: string};

type ContractInfo = {
	readonly abi: readonly AbiEntry[];
	readonly address: `0x${string}`;
	readonly startBlock?: number;
};

/** A deployment, as far as the source reads it. */
export type ContractsInfo = {
	readonly chain: {readonly id: number; readonly genesisHash?: string};
	readonly contracts: {readonly Game: ContractInfo};
};

/** The events the processor has a handler for: `onPlaced` folds `Placed`. */
function handled(entry: AbiEntry): boolean {
	return (
		entry.type === 'event' &&
		entry.name !== undefined &&
		typeof (placementProcessor as unknown as Record<string, unknown>)[
			`on${entry.name}`
		] === 'function'
	);
}

/** Each handled event once: a router's merged ABI may list one twice. */
function handledOnce(abi: readonly AbiEntry[]): AbiEntry[] {
	const seen = new Set<string>();
	return abi.filter(handled).flatMap((entry) => {
		const key = JSON.stringify(entry);
		if (seen.has(key)) return [];
		seen.add(key);
		return [{...entry}];
	});
}

export function indexingSource(info: ContractsInfo) {
	const game = info.contracts.Game;
	return {
		chainId: String(info.chain.id),
		...(info.chain.genesisHash
			? {genesisHash: info.chain.genesisHash as `0x${string}`}
			: {}),
		contracts: [
			{
				abi: handledOnce(game.abi),
				address: game.address,
				...(game.startBlock !== undefined ? {startBlock: game.startBlock} : {}),
			},
		],
	};
}

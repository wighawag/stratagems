/**
 * Stratagems' constants, read off the deployment: the commit-reveal base's
 * (the cycle, the chunk, the expected turn, the gas, the token:
 * `$lib/game/core/commit-reveal/config`) and the game's own, all from the
 * Stratagems contract's `linkedData` (what `contracts/deploy/020_deploy_game.ts`
 * recorded), so a change in the deploy cannot leave the client describing
 * another game.
 */
import type {TypedDeployments} from '$lib/core/connection/types';
import {
	bondForWholeChunks,
	resolveCommitRevealConfig,
	type CommitRevealConfig,
	type CommitRevealLinkedData,
} from '$lib/game/core/commit-reveal/config';
import {readBigInt, readNumber} from '$lib/game/core/linked-data';

export type StratagemsConfig = CommitRevealConfig & {
	/** One gem, in the token's units: what a placement puts on a cell. */
	numTokensPerGems: bigint;
	/** A cell's life when full (a removal is only allowed then). */
	maxLife: number;
	/** The token's symbol and decimals, for display. */
	currency: {symbol: string; decimals: number};
	/**
	 * What one stake adds to the reserve: a whole chunk of gems, so a first turn
	 * of up to a chunk of placements is bonded without a second deposit.
	 */
	stakeAmount: bigint;
	/** Pixels per cell at 1:1 zoom, for the canvas host's grid. */
	cellSize: number;
	/** What the camera may show, in CELLS. */
	camera: {
		initialVisible: {width: number; height: number};
		limits: {
			minWidth: number;
			minHeight: number;
			maxWidth: number;
			maxHeight: number;
		};
	};
};

/**
 * The most moves a turn may plan: the legacy client's cap, kept under one chunk
 * of 32 so a turn is one reveal transaction.
 */
export const MAX_MOVES_PER_TURN = 30;

export function resolveStratagemsConfig(
	deployments: TypedDeployments,
): StratagemsConfig {
	const linkedData = deployments.contracts.Stratagems
		.linkedData as unknown as CommitRevealLinkedData & {
		currency: {symbol: string; decimals: number};
	};
	const base = resolveCommitRevealConfig(linkedData);
	const numTokensPerGems = readBigInt(linkedData, 'numTokensPerGems');
	return {
		...base,
		numTokensPerGems,
		maxLife: readNumber(linkedData, 'maxLife'),
		currency: {
			symbol: linkedData.currency.symbol,
			decimals: Number(linkedData.currency.decimals),
		},
		stakeAmount: numTokensPerGems * BigInt(base.actionsPerReveal),
		cellSize: 10,
		camera: {
			initialVisible: {width: 24, height: 24},
			limits: {minWidth: 10, minHeight: 10, maxWidth: 100, maxHeight: 100},
		},
	};
}

/**
 * What `count` moves would cost if every one placed a gem: the bond's unit, and
 * the contract's penalty for a missed reveal shown its chunks (one gem per
 * committed move, `acknowledgeMissedReveal`).
 */
export function costOfMoves(config: StratagemsConfig, count: number): bigint {
	return config.numTokensPerGems * BigInt(count);
}

/**
 * What to bond for a turn of `count` moves: a WHOLE NUMBER OF CHUNKS, capped at
 * the reserve, so the bond does not say how many moves the commitment hides.
 */
export function bondFor(
	config: StratagemsConfig,
	count: number,
	reserve?: bigint,
): bigint {
	return bondForWholeChunks({
		costOf: (n) => costOfMoves(config, n),
		actionsPerReveal: config.actionsPerReveal,
		count,
		reserve,
	});
}

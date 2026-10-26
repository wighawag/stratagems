/**
 * The template game's constants, read off the deployment.
 *
 * Everything here comes from the Game contract's `linkedData` (what the deploy
 * script recorded) rather than being duplicated in the front end, so changing
 * the phase durations or the placement cost in `contracts/deploy` cannot leave
 * the UI describing a different game from the one on chain.
 */
import type {TypedDeployments} from '$lib/core/connection/types';
import {
	bondForWholeChunks,
	resolveCommitRevealConfig,
	signerStipend,
	type CommitRevealConfig,
	type CommitRevealLinkedData,
} from '$lib/game/core/commit-reveal/config';
import {
	optionalBigInt,
	readBigInt,
	type DeclaredValues,
} from '$lib/game/core/linked-data';

/**
 * The base's config (the cycle, the chunk, the expected turn, the gas, the
 * token: `$lib/game/core/commit-reveal/config`) and this game's own.
 */
export type PlacementConfig = CommitRevealConfig & {
	/** What one placement costs, taken from the player's reserve on reveal. */
	placementCost: bigint;
	/**
	 * Where a stake is acquired, and what it costs.
	 *
	 * The price is read off the SALE's own `linkedData` rather than the Game's,
	 * because it is the sale contract's to state: `StakeSale.purchase` reverts
	 * with `WrongPaymentAmount` unless the value it is sent matches exactly, so a
	 * number copied anywhere else is a number that can drift into reverting every
	 * purchase.
	 */
	sale: {
		address: `0x${string}`;
		/** In the chain's native currency, exact. Not a minimum. */
		price: bigint;
		/** How much reserve one purchase credits. */
		amount: bigint;
		/**
		 * What the purchase forwards to the local signer, in the same transaction.
		 *
		 * This is what makes onboarding ONE transaction rather than two: the sale
		 * pays the signer before the price is checked, so the call that stakes puts
		 * gas in the key that will spend it. Funding the signer separately means a
		 * second transaction from a wallet the first one just emptied.
		 *
		 * Sized in TURNS rather than as a round number, because what the player
		 * actually needs is a number of moves: see `signerStipend` in
		 * `$lib/game/core/commit-reveal/config`.
		 */
		stipend: bigint;
	};
	/**
	 * Pixels per cell at 1:1 zoom.
	 *
	 * Only a scene-graph renderer cares: it is the unit pixi content is authored
	 * in. The camera and the click maths are in game units and do not use it.
	 */
	cellSize: number;
	/**
	 * What the camera may show, in CELLS.
	 *
	 * Here rather than in a canvas component because it is a statement about the
	 * GAME (how much board is playable at a glance), not about a rendering
	 * library, and because both canvas hosts have to agree on it.
	 */
	camera: {
		/** How much board is visible on the first frame. */
		initialVisible: {width: number; height: number};
		/** Zoom limits, as the smallest and largest slice of board on screen. */
		limits: {
			minWidth: number;
			minHeight: number;
			maxWidth: number;
			maxHeight: number;
		};
	};
};

export function resolvePlacementConfig(
	deployments: TypedDeployments,
): PlacementConfig {
	const linkedData = deployments.contracts.Game
		.linkedData as CommitRevealLinkedData;
	const StakeSale = deployments.contracts.StakeSale;
	const saleData = StakeSale.linkedData as DeclaredValues;
	const base = resolveCommitRevealConfig(linkedData);

	// The chain's own statement of the worst gas price it expects, which is what
	// the credits machinery upstream prices actions with too. A chain that does
	// not declare one gets NO stipend rather than a guessed one: the purchase
	// still works, and the signer is funded by the top-up flow. See
	// `game/core/linked-data.ts` for why an absent parameter answers `undefined`
	// rather than a default.
	const worstGasPrice =
		optionalBigInt(deployments.chain.properties, 'expectedWorstGasPrice') ?? 0n;

	return {
		...base,
		placementCost: readBigInt(linkedData, 'placementCost'),
		sale: {
			address: StakeSale.address,
			price: readBigInt(saleData, 'price'),
			amount: readBigInt(saleData, 'amount'),
			stipend: signerStipend(base, worstGasPrice),
		},
		cellSize: 10,
		camera: {
			initialVisible: {width: 24, height: 24},
			limits: {minWidth: 10, minHeight: 10, maxWidth: 100, maxHeight: 100},
		},
	};
}

/** What a set of placements will cost when they are revealed. */
export function costOfPlacements(
	config: PlacementConfig,
	count: number,
): bigint {
	return config.placementCost * BigInt(count);
}

/**
 * What to bond for a turn of `count` placements: a WHOLE NUMBER OF CHUNKS,
 * capped at the reserve. See `bondForWholeChunks` for why: the bond is public,
 * and the exact cost would say how many placements the commitment hides.
 */
export function bondFor(
	config: PlacementConfig,
	count: number,
	reserve?: bigint,
): bigint {
	return bondForWholeChunks({
		costOf: (n) => costOfPlacements(config, n),
		actionsPerReveal: config.actionsPerReveal,
		count,
		reserve,
	});
}

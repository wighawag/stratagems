/**
 * The template game's constants, read off the deployment.
 *
 * Everything here comes from the Game contract's `linkedData` (what the deploy
 * script recorded) rather than being duplicated in the front end, so changing
 * the phase durations or the placement cost in `contracts/deploy` cannot leave
 * the UI describing a different game from the one on chain.
 */
import type {TypedDeployments} from '$lib/core/connection/types';
import {resolveCycleConfig, type CycleConfig} from '$lib/game/core/cycle';
import {
	optionalBigInt,
	readAddress,
	readBigInt,
	readNumber,
	type DeclaredValues,
} from '$lib/game/core/linked-data';

export type PlacementConfig = {
	cycle: CycleConfig;
	/** What one placement costs, taken from the player's reserve on reveal. */
	placementCost: bigint;
	/**
	 * THE CHUNK: how many actions one reveal transaction may carry.
	 *
	 * READ OFF THE DEPLOYMENT AND NEVER GUESSED. A turn longer than this is
	 * committed as a hash CHAIN and revealed in several transactions, and the
	 * client has to cut it into exactly the pieces the contract will accept: cut
	 * it larger and every reveal reverts with `TooManyActions`, cut it smaller
	 * and every non-final one reverts with `InvalidFurtherActions`. Either way
	 * the failure arrives after the stake is already bonded.
	 *
	 * `readNumber` rather than `optionalNumber`, deliberately. There is no safe
	 * default: a client that guessed would hash a chain the contract cannot
	 * follow, and would do it confidently. A deployment that does not declare
	 * this is one this build cannot play, and saying so at startup is much
	 * cheaper than saying it a cycle later with somebody's bond in the balance.
	 */
	actionsPerReveal: number;
	/**
	 * How many actions a player is EXPECTED to submit in one turn.
	 *
	 * An expectation, not a bound. `actionsPerReveal` bounds a TRANSACTION and
	 * nothing bounds a turn, so this is the only thing anything counted in turns
	 * can be sized from. Declared by the deploy because it is a claim about this
	 * game's players, which no amount of measurement would produce. It sizes the
	 * gas stipend and deliberately not the credit count - see `TURNS_OF_GAS`.
	 */
	expectedActionsPerTurn: number;
	/**
	 * What one commit and one reveal step are budgeted at on THIS deployment.
	 *
	 * Off the deployment rather than out of this file, so that a game running its
	 * own contracts cannot inherit gas measured against another game's. See the
	 * comment above {@link resolvePlacementConfig}.
	 */
	gas: GasBudget;
	/** The ERC20 the reserve is denominated in. */
	tokenAddress: `0x${string}`;
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
		 * actually needs is a number of moves: see `TURNS_OF_GAS`.
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

type GameLinkedData = DeclaredValues & {
	startTime: unknown;
	commitPhaseDuration: unknown;
	revealPhaseDuration: unknown;
};

/** What one commit and one reveal step are budgeted at, per deployment. */
export type GasBudget = {
	commit: bigint;
	reveal: bigint;
};

/**
 * Gas to allow for ONE TRANSACTION of each kind: a commit, and one reveal step.
 *
 * READ OFF THE DEPLOYMENT, NOT DECLARED HERE, and that is the important part.
 * These used to be two constants in this file, and this file is INHERITED down
 * the template tree while contracts are NOT: every game writes its own. So a
 * descendant ran its own contracts while budgeting with gas measured against
 * somebody else's, in a file whose text did not differ at all - which is the
 * failure this tree keeps paying for, a value merging cleanly while its
 * reasoning does not. `with/nft-identity` is the worked example: the same two
 * transactions measure 99,102 and 374,085 there against `main`'s 116,898 and
 * 535,561, because a placement costs nothing so a reveal writes no stake.
 *
 * Now the deploy declares them (`contracts/rocketh/config.ts`, recorded into
 * `linkedData` by `deploy/010_deploy_game.ts`) and this reads them, exactly as
 * it already does for `actionsPerReveal` and `placementCost`. A game that
 * writes its own contracts cannot inherit a wrong figure, because there is
 * nothing here to inherit. `contracts/test/js/GasBudget.test.ts` is what stops
 * the declared figures rotting as the contracts change.
 *
 * WHAT THE CHUNK BOUNDS AND WHAT IT DOES NOT, because the next reader of these
 * numbers will be the credits work and this is the distinction it turns on. The
 * reveal figure is a true maximum of ONE TRANSACTION and stays one in every game
 * on every chain, however long a turn is - that is the whole property the chunk
 * buys, and it is what makes a gas LIMIT possible at all. What the chunk does
 * not bound is the number of reveal STEPS, and in a game whose turns are
 * unbounded (any game where an action costs nothing, which includes
 * `with/nft-identity` here, and stratagems) there is no worst case for a TURN to
 * be found.
 *
 * So anything that wants to answer the player's actual question - how many TURNS
 * can I still play - cannot be sized from a maximum, and must be sized from an
 * EXPECTATION: how many actions a player is expected to submit per turn, which
 * is the game's to state and should be a named parameter rather than an implicit
 * one. That is why the stipend below is counted in STEPS: it is honest, and it
 * does not answer that question.
 *
 * The tempting alternative is to price a credit PER ACTION, which is exact and
 * gives up the thing credits exist for - "one credit is one user action" stops
 * being true, and a number that varies with what you happen to be doing is a
 * number nobody can plan against. An average with its expectation written down
 * is worth more than an exact figure with no unit.
 *
 * THEY ARE PASSED AS GAS LIMITS, and that is what the rest of this comment is
 * insurance for. A limit below what the transaction needs is not a slow turn, it
 * is an out-of-gas reveal, which is a MISSED reveal: it loses the bond and
 * blocks the next cycle until it is acknowledged. Three things stand behind it,
 * and none of them is optimism.
 *
 * The figure is measured against THESE contracts, because the deployment
 * declares it rather than this inherited file carrying one game's number into
 * another game's build (ADR-0003). `contracts/test/js/GasBudget.test.ts` fails
 * if the worst case a chunk can reach ever comes within 10% of it, so the
 * headroom is a tested property rather than an accident of when it was last
 * looked at. And gas USAGE is a property of the contract code and the pinned EVM
 * revision rather than of the chain, so the figure travels: what genuinely
 * varies per deployment is the gas PRICE, which is `expectedWorstGasPrice` in
 * the chain properties and is declared per chain already.
 *
 * What it buys is the reason to take the risk at all: the cost of a move becomes
 * a ceiling stated in advance instead of an estimate, which is the only way gas
 * can honestly be denominated in moves - and it removes an `eth_estimateGas`
 * round trip from every chunk, inside a window a multi-chunk turn is already
 * spending several transactions of.
 */

/**
 * How many TURNS of gas a new player is given.
 *
 * IT COUNTS TURNS AGAIN, AND ONLY BECAUSE THE DEPLOYMENT NOW SAYS WHAT A TURN
 * IS. When the reveal became chunked this had to become a count of STEPS - one
 * commit or one reveal transaction - because a turn had stopped having a fixed
 * cost: it arrives in `ceil(actions / actionsPerReveal)` transactions and,
 * wherever an action is free, nothing bounds how many. Counting steps was
 * honest and it did not answer the player's question, which is how many more
 * TURNS they can play.
 *
 * `expectedActionsPerTurn` is that missing number, declared by the deploy
 * because it is a statement about the GAME rather than about the framework. It
 * is an expectation and not a maximum - there is no maximum to be had - so a
 * player who plans much longer turns than the game expects will get fewer than
 * this many. That is the honest trade, and it is acceptable HERE precisely
 * because this is a starting float rather than a promise: when it runs out the
 * top-up flow is the remedy, and `resumeWhenGasArrives` picks the submission
 * back up by itself.
 *
 * IT IS NOT HOW CREDITS ARE PRICED, and the difference is the point. The credit
 * count is shown to the player as what they can still do, so it must be a FLOOR
 * (`core/connection/credits.ts` says so, and prices it at the worst expected gas
 * price for the same reason). An expectation is not a floor. So credits stay
 * denominated in what a TRANSACTION costs, which is a real bound, and only this
 * float is sized from what a turn is expected to cost.
 */
const TURNS_OF_GAS = 100n;

/**
 * What one expected turn costs in gas: a commit, and the reveals it takes.
 *
 * `ceil` because a turn that spills one action past a chunk pays for a whole
 * extra transaction, which is the cost the chunk imposes and the reason a long
 * turn honestly costs more than a short one.
 */
function gasPerExpectedTurn(
	gas: GasBudget,
	expectedActionsPerTurn: number,
	actionsPerReveal: number,
): bigint {
	const reveals = BigInt(
		Math.max(1, Math.ceil(expectedActionsPerTurn / actionsPerReveal)),
	);
	return gas.commit + gas.reveal * reveals;
}

export function resolvePlacementConfig(
	deployments: TypedDeployments,
): PlacementConfig {
	const linkedData = deployments.contracts.Game.linkedData as GameLinkedData;
	const StakeSale = deployments.contracts.StakeSale;
	const saleData = StakeSale.linkedData as DeclaredValues;

	// The chain's own statement of the worst gas price it expects, which is what
	// the credits machinery upstream prices actions with too. A chain that does
	// not declare one gets NO stipend rather than a guessed one: the purchase
	// still works, and the signer is funded by the top-up flow. See
	// `game/core/linked-data.ts` for why an absent parameter answers `undefined`
	// rather than a default.
	const worstGasPrice =
		optionalBigInt(deployments.chain.properties, 'expectedWorstGasPrice') ?? 0n;

	// REQUIRED, like `actionsPerReveal` and for the same reason: there is no safe
	// default for a number measured against contracts this build cannot see. A
	// deployment that does not declare its gas is one this client cannot size a
	// stipend for, and saying so at startup is cheaper than funding a signer with
	// a guess.
	const gas: GasBudget = {
		commit: readBigInt(linkedData, 'commitGas'),
		reveal: readBigInt(linkedData, 'revealGas'),
	};

	const actionsPerReveal = readNumber(linkedData, 'actionsPerReveal');
	// REQUIRED, for the third time in this function and for a different reason
	// from the other two. This one cannot be measured or derived at all: it is the
	// game's statement about how its players behave, and a client that guessed it
	// would fund a signer for a game nobody is playing.
	const expectedActionsPerTurn = readNumber(
		linkedData,
		'expectedActionsPerTurn',
	);

	return {
		cycle: resolveCycleConfig(linkedData),
		placementCost: readBigInt(linkedData, 'placementCost'),
		actionsPerReveal,
		expectedActionsPerTurn,
		gas,
		tokenAddress: readAddress(linkedData, 'tokens'),
		sale: {
			address: StakeSale.address,
			price: readBigInt(saleData, 'price'),
			amount: readBigInt(saleData, 'amount'),
			stipend:
				worstGasPrice *
				gasPerExpectedTurn(gas, expectedActionsPerTurn, actionsPerReveal) *
				TURNS_OF_GAS,
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
 * What to bond for a turn of `count` placements: a WHOLE NUMBER OF CHUNKS.
 *
 * THE BOND IS PUBLIC (`CommitmentMade`, `getCommitment`), so bonding the exact
 * cost would tell every observer how many placements the commitment hides. A
 * whole number of chunks says only how many reveal transactions the turn will
 * take, which the reveals disclose anyway. The surplus is not lost: the last
 * reveal releases it, and a missed reveal settled with the chunks gives it back
 * (the contract forfeits only what the placements would have cost). An empty
 * turn is zero chunks of placements and bonds nothing.
 *
 * CAPPED AT THE RESERVE, never below the cost. A reserve that covers the cost
 * and not the rounding still lets the player commit, bonding all of it (the
 * reserve is public too, so this tells nobody anything new); one that cannot
 * cover the cost is refused by the contract either way, and bonding the cost
 * keeps that refusal's numbers about the turn.
 */
export function bondFor(
	config: PlacementConfig,
	count: number,
	reserve?: bigint,
): bigint {
	const cost = costOfPlacements(config, count);
	const chunks = Math.ceil(count / config.actionsPerReveal);
	const whole = costOfPlacements(config, chunks * config.actionsPerReveal);
	if (reserve === undefined || whole <= reserve) return whole;
	return cost > reserve ? cost : reserve;
}

// ----------------------------------------------------------------------------
// Typed Config
// ----------------------------------------------------------------------------
import type {
	EnhancedEnvironment,
	UnknownDeployments,
	UserConfig,
} from 'rocketh/types';

// this one provide a protocol supporting private key as account
import {privateKey} from '@rocketh/signer';

import {parseEther} from 'viem';

/**
 * How the cycle advances. Mirrors `UsingGameTypes.CyclePolicy`, whose ORDER is
 * the contract's: these are the enum's numeric values and rearranging them here
 * would silently deploy a different policy from the one named.
 *
 * `Timed` is what a deployed game wants, and it is the only one that needs no
 * transaction to move: the cycle simply is what the clock says.
 *
 * `Manual` has no clock at all. Every phase moves because someone pushed it,
 * and only once every member the cycle waits for has acted - so a member who
 * goes silent freezes it, and the way out is to stop waiting for them rather
 * than to add a timer.
 *
 * `TimedWithEarlyAdvance` is the clock as a DEADLINE, with unanimity able to
 * bring the next phase forward. Never worse than `Timed` for anyone absent,
 * because an advance only ever widens a window.
 *
 * Changing this changes the game the client draws, because it is recorded in
 * the Game's `linkedData` and read back. The e2e suite plays a TIMED game and
 * its waits are sized against the durations below.
 */
export const CYCLE_POLICY = {
	Timed: 0n,
	Manual: 1n,
	TimedWithEarlyAdvance: 2n,
} as const;

/**
 * Gas to allow for ONE TRANSACTION of each kind: a commit, and one reveal step.
 *
 * THESE BELONG TO THE CONTRACTS AND THEREFORE TO THIS FILE, which is the change
 * that matters rather than the numbers. They used to be constants in
 * `web/src/lib/placement/config.ts`, and that file is INHERITED down this
 * template tree while contracts are NOT: every game writes its own. So a
 * descendant ran its own contracts while reading gas figures measured against
 * somebody else's, in a file whose text did not differ at all. That is not
 * hypothetical - `with/nft-identity` measures 99,102 and 374,085 for the same
 * two transactions `main` measures at 116,898 and 535,561, because a placement
 * costs nothing there so a reveal writes no stake.
 *
 * Declared here, they travel with the contracts they were measured against:
 * they are recorded in the Game's `linkedData` by `deploy/010_deploy_game.ts`
 * and read off the deployment by the client, exactly as `actionsPerReveal` and
 * `placementCost` already are. A game that writes its own contracts cannot
 * inherit a wrong figure, because there is nothing to inherit.
 *
 * They are NOT in the Solidity `Config` struct, deliberately. The contract never
 * reads a gas figure, and putting one in constructor storage would cost gas
 * forever for a number only the client budgets with. `linkedData` is the
 * established channel for what the client must agree with the deploy about.
 *
 * MEASURED ON THIS BRANCH, on a local node, at four actions per reveal. The
 * reveal's worst case is a FULL chunk of cells claimed for the first time, each
 * in a different zone: `_place` appends to a per-zone index only on a cell's
 * first claim, so four first claims across four zones is four new dynamic
 * arrays.
 *
 *   first commit (cold slots)                116,898
 *   later commit (warm slots)                 82,698
 *   first commit PAYING A FRESH PAYEE        152,154
 *   full fresh chunk, four zones, final      535,561
 *   the same chunk, non-final                534,756
 *
 * THE COMMIT'S WORST CASE IS A PAID ONE. A game that hands the skeleton a
 * reveal scheduler (`RevealScheduler`, stratagems' plan step 8, P3) makes the
 * commit carry the scheduler's payment, which `makeCommitment` forwards to
 * `payee`; the first payment goes to an account that holds nothing, which
 * costs the value transfer, the cold account and creating it. Measured
 * 2026-10-30 at 152,154 against the 150,000 this declared, so every player's
 * first scheduled commit ran out of gas (found by `with/fuzd`'s e2e). It is
 * now 175,000: the paid case plus 15%, and the GasBudget test measures it.
 *
 * Both carry a margin over the reading, because they size a RESERVATION: over
 * reserving costs a slightly larger first payment, under reserving costs a
 * player their gas mid-turn. `contracts/test/js/GasBudget.test.ts` fails if a
 * contract change outgrows either, which is what stops the margin being a
 * guess that rots.
 *
 * THEY ARE STILL NOT PASSED AS GAS LIMITS. A limit that is too low is not a slow
 * turn, it is a missed reveal, which takes the stake and blocks the next cycle
 * until it is acknowledged. Declaring them per deployment and pinning them with
 * a test is the half of that work which makes a limit possible later; the other
 * half is an explicit EXPECTATION of actions per turn, because a limit bounds a
 * transaction and nothing bounds a turn wherever an action is free.
 */
const COMMIT_GAS = 175_000n;
const REVEAL_GAS = 600_000n;

/**
 * How many actions a player is EXPECTED to submit in one turn.
 *
 * AN EXPECTATION AND NOT A MAXIMUM, which is the whole reason it has to be
 * stated rather than derived. `REVEAL_GAS` bounds a TRANSACTION, and that is a
 * real bound in every game on every chain - it is what the chunk buys. What
 * nothing bounds is a TURN: a turn arrives in `ceil(actions / actionsPerReveal)`
 * transactions, and wherever an action costs nothing there is no worst case for
 * how many. So anything answering the player's actual question - how many more
 * TURNS can I play - cannot be computed from a maximum, because there is not
 * one. It has to be sized from a number the game states out loud.
 *
 * The alternative is to price everything PER TRANSACTION, which is exact and
 * gives up the thing being measured: "you have 40 of something" is not an
 * answer when the player does not know how many of that something a turn costs.
 * An average with its expectation written down is worth more than an exact
 * figure with no unit.
 *
 * FOUR, ON THIS BRANCH, BECAUSE A TURN HERE IS BOUNDED ECONOMICALLY. One stake
 * buys ten placements and no more, so a turn is a few cells and the reserve is
 * gone in a handful of them. Four is one chunk, so the expected turn is exactly
 * one commit and one reveal - which is also why this parameter changes no
 * number on this branch, and why the branch where it matters is the one where a
 * placement is free.
 *
 * It sizes the gas stipend and nothing else today. It is deliberately NOT used
 * to price a credit: a credit count is shown to the player as what they can
 * still do, so it has to be a FLOOR, and an expectation is not one. See the
 * stipend in `web/src/lib/placement/config.ts`.
 */
const EXPECTED_ACTIONS_PER_TURN = 4n;

// we define our config and export it as "config"
export const config = {
	// Chain properties are exported with the deployments and read by the web app
	// (see web/src/lib/context/config.ts).
	//
	// Adding `creditsGasMultiplier` here is what denominates the local signer's
	// gas balance as CREDITS - "12 credits" instead of "0.0012 ETH" - so a player
	// reads how many moves they can still make rather than a wei figure. It is
	// the gas ONE user action costs, so for this game it is the worst-case gas
	// of a commit plus a reveal, and `creditsPerTopUp` (optional, default 100)
	// is how many credits a top-up buys. Neither is defaulted: half a
	// configuration would produce a confident, wrong move count, so
	// web/src/lib/core/connection/credits.ts falls back to native currency
	// unless it knows what an action actually costs.
	chains: {
		31337: {
			properties: {
				// The worst gas price this chain is expected to charge, in wei.
				// Pessimistic on purpose: it makes a credit count a floor the
				// player always gets, rather than one that drifts down with the
				// mempool while they sit still.
				expectedWorstGasPrice: parseEther('1', 'gwei'), // TODO use same value from hardhat config
				// Gas ONE USER ACTION costs, which since the reveal became chunked is
				// a commit plus ONE REVEAL STEP rather than a commit plus a whole
				// turn. A turn is no longer a transaction: it arrives in
				// `ceil(actions / actionsPerReveal)` reveals, so a long turn honestly
				// costs more credits than a short one, and a credit that still meant
				// "one turn" would be a number with no fixed gas behind it.
				//
				// MEASURED, on a local node, not reasoned about. At four actions per
				// reveal the worst case a single transaction can reach is a FULL
				// chunk of cells claimed for the first time, each in a different
				// zone: `_place` appends to a per-zone index only on a cell's first
				// claim, so four first claims across four zones is four new dynamic
				// arrays.
				//
				//   first commit (cold slots)                116,898
				//   later commit (warm slots)                 82,698
				//   full fresh chunk, four zones, final      535,561
				//   the same chunk, non-final                534,756
				//
				// So one commit plus one reveal step is 652,459 worst case, and this
				// is that plus about 15%, kept a round number because it is a policy
				// figure with a margin rather than a reading. (Since 2026-10-30 the
				// commit's share is sized for a PAID first commit, 152,154: see
				// COMMIT_GAS. A player with a reveal scheduler pays the reveal's gas
				// to the scheduler in the commit instead of sending the reveal, so
				// a credit still prices one action.) The margin is what
				// keeps the credit count a FLOOR when a contract edit moves the gas a
				// little; if one moves it a lot, this is measured again rather than
				// nudged.
				//
				// IT WAS 1,500,000, sized against the old single-transaction reveal
				// whose worst case was ten placements at once (1,334,323). That
				// reveal no longer exists: ten placements is now three transactions,
				// each bounded by the chunk, and pricing a credit at the old figure
				// would overstate what one costs by more than half.
				//
				// IT IS NO LONGER A SECOND NUMBER. It used to be typed out here as
				// 750,000 and again as `COMMIT_GAS + REVEAL_GAS` in
				// web/src/lib/placement/config.ts, with a comment explaining that the
				// agreement was the point. Two copies of one measurement is how the
				// identity branches came to price a credit 58% above what a step
				// there costs: the copy that mattered was in a file that does not
				// differ between branches, so it merged cleanly and its reasoning did
				// not. There is one measurement now and this is derived from it.
				creditsGasMultiplier: COMMIT_GAS + REVEAL_GAS,
				supportsSendRawTransactionSync: false,
			},
			tags: ['local', 'memory', 'testnet'],
		},
		// mega-eth testnet
		6342: {
			properties: {
				expectedWorstGasPrice: parseEther('0.003', 'gwei'),
				supportsSendRawTransactionSync: false,
			},
		},
		// somnia testnet
		50312: {
			properties: {
				expectedWorstGasPrice: parseEther('8', 'gwei'),
				supportsSendRawTransactionSync: false,
			},
		},
		// celo sepolia testnet
		11142220: {
			properties: {
				expectedWorstGasPrice: parseEther('25', 'gwei'),
				supportsSendRawTransactionSync: false,
			},
		},
	},
	defaultChainProperties: {
		// if not specified, fallback on:
		expectedWorstGasPrice: parseEther('0.000001', 'gwei'),
		supportsSendRawTransactionSync: false,
	},
	accounts: {
		deployer: {
			default: 0,
		},
		admin: {
			default: 0, // TODO give the admin its own account
		},
	},
	environments: {
		localhost: {
			chain: 31337,
			overrides: {
				autoMine: true,
			},
		},
	},
	data: {
		/**
		 * What one stake costs and how much of it you get.
		 *
		 * `price` is in the chain's own currency and is checked EXACTLY by
		 * `StakeSale.purchase`, so it belongs on the sale's deployment and nowhere
		 * else. It is deliberately not zero even here: a free purchase would never
		 * exercise the value split that lets one transaction pay for the stake and
		 * fund the key that plays with it.
		 *
		 * `amount` is ten placements at the placement cost below, which is enough
		 * to play with and small enough that running out is a state the game gets
		 * to demonstrate.
		 */
		sale: {
			default: {
				price: parseEther('0.00000001'),
				amount: parseEther('10'),
			},
		},
		/**
		 * Phase durations, and how much of a turn one transaction may carry.
		 *
		 * `actionsPerReveal` IS THE CHUNK, and it is here rather than in the
		 * contract because the two things that decide it are a property of the GAME
		 * (how expensive one action is to resolve) and of the CHAIN (what fits in a
		 * transaction there). A turn longer than this arrives in several reveals;
		 * the turn itself is not capped, and capping it is a game rule this
		 * framework deliberately does not take a position on.
		 *
		 * Four, for the reference game, and the number is chosen to be EXERCISED
		 * rather than to be the largest that fits. A placement's measured worst case
		 * is about 122k gas (ten fresh cells across ten zones cost 1,217,425), so a
		 * chunk of four is roughly half a million gas and would sit comfortably
		 * under any chain's ceiling at several times that size. What a larger number
		 * would cost is the only thing that matters here: this game's biggest
		 * possible turn is ten placements, so a chunk of sixteen or thirty-two would
		 * mean no turn anybody can make ever chains, and a mechanism that is never
		 * executed in the game the template ships is a mechanism nobody finds out is
		 * broken. A game built from this template picks its own, from its own
		 * measurements on its own chain.
		 *
		 * The reveal phase is the one to be careful with, and it used to be 3-4
		 * seconds. That is not survivable: a client has to NOTICE the phase turned
		 * over (the chain-synced clock ticks once a second), estimate gas, sign,
		 * broadcast, and then be MINED, all inside the window - and the contract
		 * judges the attempt by the timestamp of the block it lands in, not by when
		 * it was sent. Measured against a local node, a reveal fired the instant the
		 * phase opened still landed about 5 seconds later and reverted with
		 * `InCommitmentPhase`, forfeiting the bond.
		 *
		 * A missed reveal costs the player their stake, so this cannot be tuned
		 * optimistically. Size the reveal phase to comfortably exceed one block time
		 * plus a client round trip; ten seconds is generous on a local chain and is
		 * the floor to think from on a real one.
		 *
		 * AND IT IS NOW SIZED FOR SEVERAL TRANSACTIONS, NOT ONE. A turn longer
		 * than `actionsPerReveal` is revealed in `ceil(actions / actionsPerReveal)`
		 * transactions, in order, all of which have to land inside this window;
		 * anything still owed when it shuts is a partially applied turn whose
		 * remaining bond is forfeit. The reference game's largest possible turn is
		 * ten placements (the sale's `amount` over `placementCost`), so at four per
		 * reveal that is three sequential sends. Multiply the round trip above by
		 * that number before shortening this.
		 *
		 * THAT FACTOR IS THE CLIENT'S AND NOT THE CHAIN'S, which is the thing to
		 * know before treating it as a floor. Nonces are per account and strictly
		 * sequential, so the chunks could be broadcast in ONE burst and would still
		 * execute in order - one round trip rather than three. The client sends them
		 * one at a time today for reasons written at its reveal loop
		 * (`placement/commit-reveal.ts`), none of which is that a burst would not
		 * work. So a phase that is too short for a long turn is a pair of things to
		 * weigh rather than one: lengthen the window, or stop waiting between
		 * chunks.
		 */
		Game: {
			localhost: {
				commitPhaseDuration: 30n,
				revealPhaseDuration: 10n,
				actionsPerReveal: 4n,
				cyclePolicy: CYCLE_POLICY.Timed,
				commitGas: COMMIT_GAS,
				revealGas: REVEAL_GAS,
				expectedActionsPerTurn: EXPECTED_ACTIONS_PER_TURN,
			},
			default: {
				commitPhaseDuration: 30n,
				revealPhaseDuration: 10n,
				actionsPerReveal: 4n,
				cyclePolicy: CYCLE_POLICY.Timed,
				commitGas: COMMIT_GAS,
				revealGas: REVEAL_GAS,
				expectedActionsPerTurn: EXPECTED_ACTIONS_PER_TURN,
			},
		},
	},
	signerProtocols: {
		privateKey,
	},
} as const satisfies UserConfig;

// then we import each extensions we are interested in using in our deploy script or elsewhere

// this one provide a deploy function
import * as deployExtension from '@rocketh/deploy';
// this one provide read,execute functions
import * as readExecuteExtension from '@rocketh/read-execute';
// this one provide a deployViaProxy function that let you declaratively
//  deploy proxy based contracts
import * as deployProxyExtension from '@rocketh/proxy';
// this one provide a deployViaRouter function, used by the Game which is
//  split across several route contracts (see src/game/routes)
import * as deployRouterExtension from '@rocketh/router';
// this one provide a viem handle to clients and contracts
import * as viemExtension from '@rocketh/viem';

// and export them as a unified object
const extensions = {
	...deployExtension,
	...readExecuteExtension,
	...deployProxyExtension,
	...deployRouterExtension,
	...viemExtension,
};
export {extensions};

// then we also export the types that our config exhibit so other can use it

type Extensions = typeof extensions;
type Accounts = typeof config.accounts;
type Data = typeof config.data;
type Environment = EnhancedEnvironment<
	Accounts,
	Data,
	UnknownDeployments,
	Extensions
>;

export type {Extensions, Accounts, Data, Environment};

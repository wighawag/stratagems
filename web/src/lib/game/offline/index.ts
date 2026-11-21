/**
 * AN OFFLINE WORLD OF A COMMIT-REVEAL GAME, as steps a game's `$lib/offline`
 * composes (K2-5, jolly-roger's plan `template-tree-features.md`).
 *
 * jolly-roger's `$lib/offline-world` opens the world, keeps its boot and
 * connects its wallet: what every app's world does. This is what every
 * commit-reveal game's world does on top of it, and what each one had copied
 * into its `offline.ts`: the world's wallet and gas, the walk of the table that
 * stakes every seat, the table opened and composed on, the people at this
 * device seated (signed in, their keys authorised, the hotseat's handover), the
 * played seats resolved and what is started with the board. What a game
 * decides stays in its `offline.ts`: its deployment, what a seat is staked
 * with, who an address plays as, how its world seats decide, and any step of
 * its own between these.
 *
 * STEPS RATHER THAN ONE FUNCTION WITH HOOKS, deliberately: the games vary in
 * eight places already, and a game that varies in a ninth calls one more
 * function of its own instead of widening a shared spec. See the README.
 */
export {worldChain, worldReader} from './chain';
export {
	createOfflineWallet,
	giveGas,
	type OfflineWallet,
	type WorldNodeProvider,
} from './wallet';
export {
	stakeEverySeat,
	resolvePlayedSeats,
	type StakedSeat,
	type PlayedSeat,
} from './seats';
export {
	openTheWorldsTable,
	theWorldsGame,
	type TableAt,
	type WhereTheGameIs,
} from './table';
export {
	revealerForTheHumans,
	seatTheHumans,
	handOverBetweenThem,
	type HumanHere,
} from './humans';
export {readyToPlay, holdTheWorldOnTheConsole} from './ready';

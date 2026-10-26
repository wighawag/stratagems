/**
 * The gas the client budgets with, for ONE TRANSACTION of each kind, and the
 * turn it expects.
 *
 * Recorded in the Stratagems deployment's `linkedData` by `020_deploy_game.ts`,
 * beside the contract's `Config` and NOT in it (the contract never reads a gas
 * figure), and read by the template's commit-reveal client
 * (`web/src/lib/game/core/commit-reveal/config.ts`), which passes `commitGas` and
 * `revealGas` as the gas LIMIT of every commit and every reveal chunk and sizes
 * the signer's stipend from them. So they are CEILINGS: a reveal that needs more
 * than `revealGas` runs out of gas, which is a missed reveal and the bond.
 * `test/Stratagems.gas.test.ts` fails when the worst case it measures comes within
 * 10% of either, or sits more than three times under it (as the template's
 * `GasBudget.test.ts` does, ADR-0003 of template-commit-reveal `work`).
 *
 * MEASURED (2026-10-26, step 6b of work/plans/join-template-commit-reveal.md),
 * on Hardhat's simulated network, at 32 moves per reveal:
 *
 *   first commit (cold slots)                                         118,248
 *   a full chunk of 32 placements, each on an empty cell with
 *   four living enemy neighbours of four other players, cold        6,019,419
 *
 * Each declared figure carries a margin over its reading, because it sizes a
 * reservation and is a limit: over-reserving costs a slightly larger stipend,
 * under-reserving costs a player their bond.
 */
export const CLIENT_GAS = {
	/** 27% over the reading. */
	commitGas: 150_000n,
	/**
	 * 16% over the reading. About 188k gas a move: a placement updates four
	 * neighbours and up to five owners' points in the generator. A chunk of 32 is
	 * well under the 16,777,216 a transaction may carry since Osaka (EIP-7825),
	 * but neighbours dying in the reveal's own cycle (not measured, see the test)
	 * add token transfers, so the deployment step measures that before a live
	 * chain trusts this.
	 */
	revealGas: 7_000_000n,
	/**
	 * How many moves a turn is EXPECTED to carry: an expectation, not a maximum
	 * (the client caps a turn at 30 moves, under one chunk of 32). Ten is a
	 * handful of placements and a removal or two, which is what a turn of
	 * stratagems is; it only sizes the signer's stipend in turns.
	 */
	expectedActionsPerTurn: 10n,
} as const;

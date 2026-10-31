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
 * and (2026-10-30, step 8, the `with/fuzd` layer) the first commit that PAYS the
 * reveal scheduler: `makeCommitment` forwarding `msg.value` to the player's fuzd
 * remote account while it holds nothing (the value transfer, the cold account,
 * and creating it), which is every scheduled player's first commit:
 *
 *   first commit paying a fresh payee                                  147,123
 *   (the unpaid first commit, measured the same day                    112,716)
 *
 * and (2026-10-30, step D, PD5) the two paths still open before a live chain:
 *
 *   a full chunk of 32 placements whose every neighbour (four per move,
 *   128 cells) is found dead in the reveal's own cycle               4,287,945
 *   (CHEAPER than the living case: a dead neighbour is not re-scored
 *   in the generator; the case of the living neighbours, re-measured
 *   the same day                                                    6,013,873)
 *   the first commit paying a fresh payee, on a fork of BASE
 *   (`scripts/dry-run-alpha2.ts`, the `alpha2` deploy, chain type op) 149,589
 *
 * so both figures below stand for Base as declared.
 *
 * and (2026-10-31, step X2) after the resolution's payouts and points moved
 * behind two internal virtual hooks for `StratagemsSimulation` (the reveal's
 * code otherwise unchanged; the optimiser shares the calls, so it is cheaper):
 *
 *   the full chunk of the living case                                6,002,468
 *   the full chunk whose every neighbour dies                        4,286,012
 *   the reveal of 30 placements on the fork of Base                  3,336,808
 *   (step D's 3,337,329; the commits unchanged)
 *
 * then (the same day) after every resolution emits the cells it wrote
 * (`CellsWritten`, which the indexer folds instead of a copy of the rules) and
 * a reveal refuses a cycle past 24 bits:
 *
 *   the full chunk of the living case                                6,140,942
 *   the full chunk whose every neighbour dies                        4,424,486
 *   the reveal of 30 placements on the fork of Base                  3,425,075
 *   the first commit paying a fresh payee, on the fork               149,577
 *
 * so neither declared figure moves: the living case is 12.3% under
 * `revealGas`, still over the 10% the gas test asks.
 *
 * Each declared figure carries a margin over its reading, because it sizes a
 * reservation and is a limit: over-reserving costs a slightly larger stipend,
 * under-reserving costs a player their bond.
 */
export const CLIENT_GAS = {
	/**
	 * The paid first commit plus 15%, rounded up (169,191): the template's rule
	 * for its own game (175,000 from 152,154). It was 150,000, 27% over the
	 * unpaid reading, which left a paid first commit under 2% of headroom.
	 */
	commitGas: 170_000n,
	/**
	 * 16% over the reading. About 188k gas a move: a placement updates four
	 * neighbours and up to five owners' points in the generator. A chunk of 32 is
	 * well under the 16,777,216 a transaction may carry since Osaka (EIP-7825).
	 * Neighbours dying in the reveal's own cycle cost LESS (measured in step D,
	 * above), so the living case is the worst and this stands for Base.
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

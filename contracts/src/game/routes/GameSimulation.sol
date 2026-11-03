// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../internal/UsingGameInternal.sol";
import "../interfaces/IGame.sol";

/// @dev THE GAME'S RULE, CALLABLE WITHOUT A CHAIN. A client runs this route's
///      deployed bytecode in its own sandbox (`web/src/lib/game/simulation/`)
///      to preview what a planned turn does, so the preview is the rule the
///      reveal runs and not a copy of it. It reads NO storage, which is what
///      makes that possible: the sandbox holds the code and none of the state.
contract GameSimulation is IGameSimulation, UsingGameInternal {
    constructor(Config memory config) UsingGameInternal(config) {}

    /// @inheritdoc IGameSimulation
    /// @dev `view` and not `pure` only because it reads {PLACEMENT_COST}, an
    ///      immutable, which lives in this contract's code: run from the
    ///      deployed bytes, it is the deployment's cost.
    ///
    ///      The traversal is the reveal's, one placement after another in
    ///      order, so a turn that names a cell twice resolves as the reveal
    ///      resolves it. The lookup is a scan, which the reveal does not need
    ///      (it reads storage) and which costs nothing that matters here: this
    ///      runs in a client's sandbox, not in a transaction.
    function resolvePlacements(
        PlayerCell[] calldata cells,
        Placement[] calldata placements
    ) external view returns (PlayerCell[] memory outcome) {
        outcome = cells;
        for (uint256 i = 0; i < placements.length; i++) {
            uint64 cellID = placements[i].cellID;
            uint256 j = 0;
            while (j < outcome.length && outcome[j].cellID != cellID) j++;
            if (j == outcome.length) revert CellNotGiven(cellID);
            outcome[j] = _placementOutcome(outcome[j], PLACEMENT_COST);
        }
    }
}

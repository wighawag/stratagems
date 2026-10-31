// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {UsingCommitRevealErrors} from "../../commit-reveal/interfaces/UsingCommitRevealErrors.sol";

/// @dev EVERY ERROR A TURN CAN RAISE IS THE MECHANISM'S, so they are inherited
///      from the commit-reveal base (`src/commit-reveal/`). What is declared
///      here is this game's own, and there is one: the simulation route's.
interface UsingGameErrors is UsingCommitRevealErrors {
    /// @notice The simulation was asked to place on a cell it was not given.
    /// @dev {IGameSimulation-resolvePlacements} resolves only what it is handed,
    ///      because it reads no storage: a cell the client did not load would
    ///      otherwise be resolved as though it were empty.
    error CellNotGiven(uint64 cellID);
}

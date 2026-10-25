// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {UsingCommitRevealErrors} from "../../commit-reveal/interfaces/UsingCommitRevealErrors.sol";

/// @dev EVERY ERROR THIS GAME RAISES IS THE MECHANISM'S, so they are inherited
///      from the commit-reveal base (`src/commit-reveal/`) and none is declared
///      here. A rule of this game's own would add its error to this interface,
///      which is why it is kept rather than folded away.
interface UsingGameErrors is UsingCommitRevealErrors {}

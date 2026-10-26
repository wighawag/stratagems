// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "./UsingStratagemsTypes.sol";
import {UsingCommitRevealErrors} from "../../commit-reveal/interfaces/UsingCommitRevealErrors.sol";

/// @dev The base's errors (phase, commitment, reserve, bond, chunk) plus the game's.
interface UsingStratagemsErrors is UsingStratagemsTypes, UsingCommitRevealErrors {
    error ImpossibleConfiguration();

    error CycleTooFar(uint64 cycleNumber);

    /// @dev `addToReserveAndFund` was sent a value with no address to forward it to.
    error StipendWithoutRecipient();

    /// @dev `addToReserveAndFund` could not forward the value to `stipendTo`.
    error StipendNotSent(address stipendTo, uint256 amount);
}

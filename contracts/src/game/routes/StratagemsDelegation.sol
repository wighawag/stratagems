// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import {UsingDelegation} from "@etherplay/delegation/contracts/UsingDelegation.sol";

/// @notice Who may act for whom: a local signer the player authorised commits
///         and cancels for them, as the base's `_playerOf` resolves it. The
///         template's `GameDelegation`, under stratagems' name. Takes no config.
contract StratagemsDelegation is UsingDelegation {}

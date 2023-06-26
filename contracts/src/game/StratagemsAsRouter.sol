// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import './StratagemsInterface.sol';

/// @title Stratagems, the infinite board game
/// @author Ronan Sandford (@wighawag)
/// @notice Stratagems is an infinite board game, a persistent and permission-less game
/// where players use a specific set of colors to compete for the control of the board.
/// Alliances and betrayal are part of the arsenal as colors mix and shift on the board.
contract StratagemsAsRouter is StratagemsInterface {
	constructor(IStratagemsCore core, IERC721 erc721) StratagemsInterface(core, erc721) {}
}

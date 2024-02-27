// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./UsingStratagemsDebugTypes.sol";

interface UsingStratagemsDebugEvents is UsingStratagemsDebugTypes {
    event ForceCells(DebugCell[] cells);
    event ForceSimpleCells(uint24 epoch, SimpleCell[] cells);
}

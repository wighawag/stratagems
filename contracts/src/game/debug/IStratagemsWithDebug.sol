// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../interface/IStratagems.sol";
import "./UsingStratagemsDebugTypes.sol";
import "./UsingStratagemsDebugEvents.sol";

interface IStratagemsDebug is UsingStratagemsDebugTypes, UsingStratagemsDebugEvents {
    error InvalidCellOverwrite();
    error InvalidLifeConfiguration(uint256 life, int32 x, int32 y);

    function forceMoves(address player, Move[] memory moves) external;

    function forceSimpleCells(SimpleCell[] memory cells) external;

    function getRawCell(uint256 id) external view returns (Cell memory cell);
}

interface IStratagemsWithDebug is IStratagems, IStratagemsDebug {}

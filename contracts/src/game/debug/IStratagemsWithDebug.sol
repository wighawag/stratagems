// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/IStratagems.sol";
import "./UsingStratagemsDebugTypes.sol";
import "./UsingStratagemsDebugEvents.sol";

interface IStratagemsDebug is UsingStratagemsDebugTypes, UsingStratagemsDebugEvents {
    error InvalidCellOverwrite();
    error InvalidLifeConfiguration(uint256 life, int32 x, int32 y);

    function forceMoves(address player, Move[] memory moves) external;

    function forceSimpleCells(SimpleCell[] memory cells) external;

    function getRawCell(uint256 id) external view returns (Cell memory cell);

    /// @notice the owner as stored (zero for none), where `ownerOf` would revert
    function getRawOwner(uint256 id) external view returns (address owner);

    /// @notice the record of the first move on the cell in its cycle (`StratagemsSimulation`'s test reads it)
    function getRawCellAtCycleStart(uint256 id) external view returns (CellAtCycleStart memory start);
}

interface IStratagemsWithDebug is IStratagems, IStratagemsDebug {}

// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/UsingStratagemsTypes.sol";

/// @dev The game's storage. The reserve, the commitments and the cycle are the
///      commit-reveal base's, in its own namespaced storage.
contract UsingStratagemsStore is UsingStratagemsTypes {
    mapping(uint256 => Cell) internal _cells;
    mapping(uint256 => uint256) internal _owners; //owner + approval + ... erc721

    /// @dev the cell before the first move on it in a cycle: see {CellAtCycleStart}
    mapping(uint256 => CellAtCycleStart) internal _cellsAtCycleStart;

    mapping(address => mapping(address => bool)) internal _operatorsForAll;
    mapping(uint256 => address) internal _operators;
}

// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsSetters.sol";

contract StratagemsPoke is IStratagemsPoke, UsingStratagemsSetters {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @notice bring a cell up to the current cycle, paying out the shares a death owes
    function poke(uint64 position) external {
        (uint24 cycle, ) = _currentCycle();
        Resolution memory r = _newResolution(5, 5, EFFECTS_PER_POKE);
        _pokeIn(r, position, cycle);
        _apply(r);
        emit SinglePoke(cycle, position);
    }

    function pokeMultiple(uint64[] calldata positions) external {
        (uint24 cycle, ) = _currentCycle();
        uint256 numCells = positions.length;
        Resolution memory r = _newResolution(numCells * 5, numCells * 5, numCells * EFFECTS_PER_POKE);
        for (uint256 i = 0; i < numCells; i++) {
            _pokeIn(r, positions[i], cycle);
        }
        _apply(r);
        emit MultiPoke(cycle, positions);
    }
}

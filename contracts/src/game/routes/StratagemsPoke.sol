// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsSetters.sol";

contract StratagemsPoke is IStratagemsPoke, UsingStratagemsSetters {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @notice bring a cell up to the current cycle, paying out the shares a death owes
    function poke(uint64 position) external {
        (uint24 cycle, ) = _currentCycle();
        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](5),
            numTransfers: 0
        });
        _poke(transferCollection, position, cycle);
        _multiTransfer(TOKENS, transferCollection);
        emit SinglePoke(cycle, position);
    }

    function pokeMultiple(uint64[] calldata positions) external {
        (uint24 cycle, ) = _currentCycle();
        uint256 numCells = positions.length;
        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](numCells * 5),
            numTransfers: 0
        });
        for (uint256 i = 0; i < numCells; i++) {
            _poke(transferCollection, positions[i], cycle);
        }
        _multiTransfer(TOKENS, transferCollection);
        emit MultiPoke(cycle, positions);
    }
}

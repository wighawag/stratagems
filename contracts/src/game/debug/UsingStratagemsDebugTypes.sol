// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/UsingStratagemsTypes.sol";

interface UsingStratagemsDebugTypes is UsingStratagemsTypes {
    struct DebugCell {
        uint64 position;
        address owner;
        uint24 lastCycleUpdate;
        uint24 cycleWhenTokenIsAdded;
        Color color;
        uint8 life;
        int8 delta;
        uint8 enemyMap;
    }

    // function forceCells(DebugCell[] memory cells) external;

    struct SimpleCell {
        uint64 position;
        address owner;
        Color color;
        uint8 life;
        uint8 stake;
    }
}

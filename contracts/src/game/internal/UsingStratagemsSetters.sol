// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "./UsingStratagemsState.sol";
import "../interface/UsingStratagemsEvents.sol";
import "./UsingStratagemsUtils.sol";
import "../../utils/PositionUtils.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/UsingERC721Events.sol";
import {CommitReveal} from "../../commit-reveal/CommitReveal.sol";

/// @dev THE RULES, AND THE ONE PROPERTY THEY KEEP: the board after a cycle's
///      reveals does not depend on the order they arrive in (AGENTS.md,
///      "Commit-reveal rules"; asserted by `test/Stratagems.order.test.ts`).
///
///      - A move is judged against the cell as it stood before any reveal of
///        the cycle moved on it ({CellAtCycleStart}), never the current board.
///      - A cell ALIVE at the cycle's start is its owner's alone to act on this
///        cycle: they may re-place it at any life, or remove it at full life.
///        Anyone else's move on it, and any move on a live Evil cell, is
///        skipped (costs nothing, changes nothing).
///      - A cell dead or empty at the cycle's start is free: anyone may place
///        on it, and a second placement on it in the same cycle is a collision,
///        which makes it Evil with one gem per placement (all kept).
///      - Every payout of the cycle goes to the owners at its start, and an
///        owner holds `NUM_TOKENS_PER_GEMS * stake` points in the generator
///        exactly while their cell is alive with a positive effective delta.
abstract contract UsingStratagemsSetters is UsingStratagemsState, UsingStratagemsUtils, UsingERC721Events {
    using PositionUtils for uint64;

    constructor(Config memory config) UsingStratagemsState(config) {}

    //-------------------------------------------------------------------------
    // ON THE BASE
    //-------------------------------------------------------------------------

    /// @notice One chunk of a reveal: checked by the base, resolved here, charged by the base.
    /// @dev The chunk costs one gem per placed move, taken from the bond (and
    ///      the reserve) by {_closeChunk}; a skipped move or a removal costs
    ///      nothing, and a removal returns its gem to the player's wallet.
    function _reveal(uint256 player, Move[] calldata moves, bytes32 secret, bytes24 furtherActions) internal {
        CommitReveal.Chunk memory chunk = _openChunk(
            player,
            _digest(moves, secret, furtherActions),
            moves.length,
            furtherActions
        );
        emit MovesRevealed(player, chunk.cycleNumber, moves);
        // refused rather than wrapped, as {_currentCycle} does: a cell stores
        // its cycle in 24 bits, and a wrapped one reads as many cycles old
        if (chunk.cycleNumber > type(uint24).max) {
            revert CycleTooFar(chunk.cycleNumber);
        }
        uint256 cost = _resolveMoves(address(uint160(player)), uint24(chunk.cycleNumber), moves);
        _closeChunk(chunk, cost);
    }

    /// @notice A missed reveal settled shown its chunk: one gem per committed move, burnt.
    function _acknowledgeMissedReveal(
        uint256 player,
        Move[] calldata moves,
        bytes32 secret,
        bytes24 furtherActions
    ) internal {
        CommitReveal.Chunk memory chunk = _openMissedChunk(
            player,
            _digest(moves, secret, furtherActions),
            moves.length,
            furtherActions
        );
        _closeChunk(chunk, moves.length * NUM_TOKENS_PER_GEMS);
    }

    //-------------------------------------------------------------------------
    // MOVES
    //-------------------------------------------------------------------------

    /// @return cost what the moves cost: one gem per placed move
    function _resolveMoves(address player, uint24 cycle, Move[] memory moves) internal returns (uint256 cost) {
        // max number of transfer is (4+1) * moves.length
        // (for each move's cell's neighbours potentially being a different account)
        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](moves.length * 5 + 1),
            numTransfers: 0
        });
        MoveTokens memory tokens;
        for (uint256 i = 0; i < moves.length; i++) {
            (uint256 placed, uint256 returned) = _computeMove(transferCollection, player, cycle, moves[i]);
            tokens.tokensPlaced += placed;
            tokens.tokensReturned += returned;
        }
        if (tokens.tokensReturned != 0) {
            _collectTransfer(transferCollection, TokenTransfer({to: payable(player), amount: tokens.tokensReturned}));
        }
        _multiTransfer(TOKENS, transferCollection);
        cost = tokens.tokensPlaced;

        uint64[] memory centres = new uint64[](moves.length);
        for (uint256 i = 0; i < moves.length; i++) {
            centres[i] = moves[i].position;
        }
        _emitCellsWritten(cycle, centres);
    }

    /// @notice {CellsWritten} for a resolution around `centres` (the moves', or the pokes', positions).
    /// @dev A centre is always listed (the move or the poke writes it, unless
    ///      skipped, when listing it again changes nothing); a neighbour only
    ///      when it holds a colour, since a resolution writes no other
    ///      ({_updateCell}). Every slot read is warm by then.
    ///
    ///      IN ASSEMBLY, AND THE LOG WRITTEN IN PLACE, in its ABI encoding (the
    ///      two offsets, then each array's length and words). Measured on the
    ///      32-move chunk (2026-10-31): through `emit`, one array of two words
    ///      per cell cost 310,205 gas (5.2%), two thirds of it a memory array of
    ///      struct pointers and its copy into the encoding; the same words in
    ///      place, 213,047; one word per cell and the owner only for the moved
    ///      cells, 159,866; that in assembly, 138,474 (2.3%): about 50,000 of it
    ///      the log's bytes, the rest the reads and the memory, which is dear by
    ///      then because the resolution's own allocations are never freed (the
    ///      log entry of step X2 in work/plans/join-template-commit-reveal.md).
    function _emitCellsWritten(uint24 cycle, uint64[] memory centres) internal {
        bytes32 topic = CellsWritten.selector;
        uint256 cellsSlot;
        uint256 ownersSlot;
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            cellsSlot := _cells.slot
            ownersSlot := _owners.slot
        }
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            let numCentres := mload(centres)
            let data := mload(0x40)
            mstore(data, 0x40)
            mstore(add(data, 0x20), add(0x60, mul(numCentres, 0x20)))
            mstore(add(data, 0x40), numCentres)
            // the cells' length, then their words
            let cellsAt := add(add(data, 0x60), mul(numCentres, 0x20))
            // reserved before any is written: the most the centres can list
            mstore(0x40, add(add(cellsAt, 0x20), mul(mul(numCentres, 5), 0x20)))
            let n := 0
            for {
                let i := 0
            } lt(i, numCentres) {
                i := add(i, 1)
            } {
                let centre := mload(add(add(centres, 0x20), mul(i, 0x20)))
                // the owner of the moved cell (scratch space for the slot's hash)
                mstore(0, centre)
                mstore(0x20, ownersSlot)
                mstore(add(add(data, 0x60), mul(i, 0x20)), or(shl(64, sload(keccak256(0, 0x40))), centre))
                let x := and(centre, 0xffffffff)
                let y := shr(32, centre)
                // the centre, then up, left, down, right ({PositionUtils.offset}: 32 bits each, wrapping)
                for {
                    let k := 0
                } lt(k, 5) {
                    k := add(k, 1)
                } {
                    let position := centre
                    switch k
                    case 1 {
                        position := or(shl(32, and(sub(y, 1), 0xffffffff)), x)
                    }
                    case 2 {
                        position := or(shl(32, y), and(sub(x, 1), 0xffffffff))
                    }
                    case 3 {
                        position := or(shl(32, and(add(y, 1), 0xffffffff)), x)
                    }
                    case 4 {
                        position := or(shl(32, y), and(add(x, 1), 0xffffffff))
                    }
                    mstore(0, position)
                    mstore(0x20, cellsSlot)
                    let word := sload(keccak256(0, 0x40))
                    // a neighbour without a colour (bits 72 to 79) was not written
                    if or(iszero(k), and(shr(72, word), 0xff)) {
                        mstore(add(add(cellsAt, 0x20), mul(n, 0x20)), or(shl(128, position), word))
                        n := add(n, 1)
                    }
                }
            }
            mstore(cellsAt, n)
            log2(data, sub(add(add(cellsAt, 0x20), mul(n, 0x20)), data), topic, cycle)
        }
    }

    function _countBits(uint8 n) internal pure returns (uint8 count) {
        while (n != 0) {
            n = n & (n - 1);
            count++;
        }
    }

    // Note on COLLISION: every placement on a cell free at the cycle's start
    // after the first makes it Evil and adds one to its stake, all kept. Making
    // it black in all cases avoids a cell with several owners sharing winnings.
    function _computeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move
    ) internal returns (uint256 tokensPlaced, uint256 tokensReturned) {
        (Cell memory currentState, bool justDied) = _getUpdatedCell(move.position, cycle);

        CellAtCycleStart memory start = _cellsAtCycleStart[move.position];
        bool firstMoveThisCycle = start.cycle != cycle;
        if (firstMoveThisCycle) {
            // no move of this cycle has touched it, so the current record is
            // its state at the cycle's start (a neighbour's move changes
            // neither its life at this cycle nor its owner)
            start = CellAtCycleStart({owner: _ownerOf(move.position), cycle: cycle, life: currentState.life});
        }

        // the validity of the move, against the cycle's start
        if (start.life != 0) {
            // alive at the start: its owner's alone this cycle
            if (start.owner != player) {
                return (0, 0);
            }
            if (move.color == Color.None) {
                if (start.life != MAX_LIFE || currentState.life == 0 || _ownerOf(move.position) != player) {
                    // only a cell at full life at the start, and still the player's, can be removed
                    return (0, 0);
                }
            }
        } else {
            // dead or empty at the start: free
            if (move.color == Color.None) {
                // nothing of the player's to remove
                return (0, 0);
            }
            if (currentState.cycleWhenTokenIsAdded == cycle && currentState.life != 0) {
                // already placed on in this cycle: a collision
                move.color = Color.Evil;
            }
        }

        if (firstMoveThisCycle) {
            _cellsAtCycleStart[move.position] = start;
        }

        // we might have distribution still to do
        uint8 distribution = currentState.distribution;
        if (justDied) {
            // if we just died, we have to distribute to all
            distribution = (currentState.enemyMap << 4) + _countBits(currentState.enemyMap);
            currentState.lastCycleUpdate = 0;
        }

        if (move.color == Color.None) {
            tokensReturned = NUM_TOKENS_PER_GEMS;
        }

        emit MoveProcessed(move.position, player, currentState.color, move.color);

        tokensPlaced = _completeMove(transferCollection, player, cycle, move, currentState, distribution, start.owner);
    }

    function _completeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move,
        Cell memory currentState,
        uint8 distribution,
        address ownerAtStart
    ) internal returns (uint256 tokensPlaced) {
        unchecked {
            (int8 newDelta, uint8 newEnemyMap) = _propagate(
                transferCollection,
                move,
                cycle,
                currentState.color,
                distribution,
                currentState.stake,
                ownerAtStart
            );

            address currentOwner = _ownerOf(move.position);
            uint8 oldLife = currentState.life;
            uint8 oldStake = currentState.stake;
            int8 oldEffectiveDelta = _effectiveDelta(currentState.delta, currentState.enemyMap);

            currentState.color = move.color;
            currentState.distribution = 0;
            if (!(currentOwner == player && currentState.life > 0)) {
                // an owner acting on their own live cell does not mark it placed:
                // nobody else can act on it this cycle anyway
                currentState.cycleWhenTokenIsAdded = cycle;
            }

            if (currentState.color == Color.None) {
                currentState.producingCycles += cycle - currentState.lastCycleUpdate;
                currentState.life = 0;
                currentState.stake = 0;
                currentState.lastCycleUpdate = 0;
                currentState.delta = 0;
                currentState.enemyMap = 0;
                _setPoints(currentOwner, oldLife, oldStake, oldEffectiveDelta, address(0), 0, 0, 0);
                emit Transfer(currentOwner, address(0), move.position);
                _owners[move.position] = 0;
            } else {
                tokensPlaced = NUM_TOKENS_PER_GEMS;
                _placeColor(player, currentOwner, currentState, move, cycle, newDelta, newEnemyMap);
            }

            _cells[move.position] = currentState;
        }
    }

    function _placeColor(
        address player,
        address oldOwner,
        Cell memory currentState,
        Move memory move,
        uint24 cycle,
        int8 newDelta,
        uint8 newEnemyMap
    ) internal {
        int8 oldEffectiveDelta = _effectiveDelta(currentState.delta, currentState.enemyMap);
        uint8 oldLife = currentState.life;
        uint8 oldStake = currentState.stake;

        currentState.enemyMap = newEnemyMap;

        if (currentState.color == Color.Evil && oldLife != 0) {
            // a collision (or one more on it): the cell keeps every gem placed
            unchecked {
                currentState.stake += 1;
                if (currentState.stake == 0) {
                    // capped, the gem beyond is kept
                    currentState.stake = 255;
                }
            }
        } else {
            currentState.stake = 1;
            currentState.producingCycles = 0;
        }

        currentState.delta = newDelta;
        currentState.life = 2;
        currentState.lastCycleUpdate = cycle;

        address newOwner = currentState.color == Color.Evil ? EVIL_OWNER : player;
        _setPoints(
            oldOwner,
            oldLife,
            oldStake,
            oldEffectiveDelta,
            newOwner,
            currentState.life,
            currentState.stake,
            _effectiveDelta(currentState.delta, currentState.enemyMap)
        );

        if (newOwner != oldOwner) {
            emit Transfer(oldOwner, newOwner, move.position);
        }
        _owners[move.position] = uint256(uint160(newOwner));
    }

    /// @notice Move a cell's points from its old holding to its new one.
    /// @dev An owner holds `NUM_TOKENS_PER_GEMS * stake` exactly while the cell
    ///      is alive with a positive effective delta. alpha1 computed the
    ///      difference case by case, and missed some (a third placement on an
    ///      Evil cell whose delta changed in between).
    function _setPoints(
        address oldOwner,
        uint8 oldLife,
        uint8 oldStake,
        int8 oldEffectiveDelta,
        address newOwner,
        uint8 newLife,
        uint8 newStake,
        int8 newEffectiveDelta
    ) internal {
        uint256 oldHolding = oldOwner != address(0) && oldLife > 0 && oldEffectiveDelta > 0
            ? NUM_TOKENS_PER_GEMS * oldStake
            : 0;
        uint256 newHolding = newOwner != address(0) && newLife > 0 && newEffectiveDelta > 0
            ? NUM_TOKENS_PER_GEMS * newStake
            : 0;
        if (oldOwner == newOwner) {
            if (newHolding > oldHolding) {
                _addPoints(newOwner, newHolding - oldHolding);
            } else if (oldHolding > newHolding) {
                _removePoints(oldOwner, oldHolding - newHolding);
            }
        } else {
            if (oldHolding != 0) {
                _removePoints(oldOwner, oldHolding);
            }
            if (newHolding != 0) {
                _addPoints(newOwner, newHolding);
            }
        }
    }

    function _propagate(
        TokenTransferCollection memory transferCollection,
        Move memory move,
        uint24 cycle,
        Color color,
        uint8 distribution,
        uint8 stake,
        address ownerAtStart
    ) internal returns (int8 newDelta, uint8 newEnemyMap) {
        (
            int8 newComputedDelta,
            uint8 newComputedEnemyMap,
            uint256 numDue,
            address[4] memory ownersToPay
        ) = _updateNeighbours(move.position, cycle, color, move.color, distribution);

        _payShares(transferCollection, ownerAtStart, numDue, ownersToPay, stake, distribution);
        newDelta = newComputedDelta;
        newEnemyMap = newComputedEnemyMap;
    }

    /// @dev `due` (tokens, the shares of dying neighbours this cell was an
    ///      enemy of) to the cell's owner at the cycle's start, and this cell's
    ///      own stake, if it just died, to its enemies' owners.
    ///
    ///      EVERY SHARE IS ROUNDED ON ITS OWN, as `stake * (NUM_TOKENS_PER_GEMS / count)`,
    ///      whichever path pays it. alpha1 summed a move's shares in twelfths of
    ///      a gem and divided once, while a poke divided per share, and which
    ///      path pays a share depends on the order of the cycle's reveals: the
    ///      rounding dust then moved between players with the order.
    function _payShares(
        TokenTransferCollection memory transferCollection,
        address owner,
        uint256 due,
        address[4] memory ownersToPay,
        uint8 stake,
        uint8 distribution
    ) internal view {
        if (due > 0) {
            _collectTransfer(transferCollection, TokenTransfer({to: payable(owner), amount: due}));
        }
        for (uint8 i = 0; i < 4; i++) {
            if (ownersToPay[i] != address(0)) {
                _collectTransfer(
                    transferCollection,
                    TokenTransfer({
                        to: payable(ownersToPay[i]),
                        amount: stake * (NUM_TOKENS_PER_GEMS / (distribution & 0x0f))
                    })
                );
            }
        }
    }

    function _poke(TokenTransferCollection memory transferCollection, uint64 position, uint24 cycle) internal {
        (Cell memory currentState, bool justDied) = _getUpdatedCell(position, cycle);

        // we might have distribution still to do
        uint8 distribution = currentState.distribution;
        if (justDied) {
            // if we just died, we have to distribute to all.
            // Its lastCycleUpdate stays the cycle, as when a neighbour finds it
            // dead: alpha1 zeroed it here, which stopped neighbours updating
            // the dead cell, so its delta depended on whether a poke came first.
            distribution = (currentState.enemyMap << 4) + _countBits(currentState.enemyMap);
        }

        (, , uint256 numDue, address[4] memory ownersToPay) = _updateNeighbours(
            position,
            cycle,
            currentState.color,
            currentState.color,
            distribution
        );

        _payShares(
            transferCollection,
            _ownerAtCycleStart(position, cycle),
            numDue,
            ownersToPay,
            currentState.stake,
            distribution
        );

        currentState.distribution = 0;
        _cells[position] = currentState;
    }

    /// @dev THE ONE PLACE POINTS LEAVE A RESOLUTION, with {_removePoints}, and
    ///      so a hook: `StratagemsSimulation` overrides both to record the
    ///      changes instead of making them (see {_multiTransfer}).
    function _addPoints(address owner, uint256 amount) internal virtual {
        GENERATOR.add(owner, amount);
    }

    /// @dev See {_addPoints}.
    function _removePoints(address owner, uint256 amount) internal virtual {
        GENERATOR.remove(owner, amount);
    }

    //-------------------------------------------------------------------------
    // NEIGHBOURS
    //-------------------------------------------------------------------------

    struct CellUpdate {
        int8 delta;
        uint8 enemymap;
        uint256 due;
    }

    /// @param side 0 up, 1 left, 2 down, 3 right (the bit in the enemy map)
    function _updateNeighbour(
        address[4] memory ownersToPay,
        CellUpdate memory cellUpdate,
        uint64 position,
        uint8 side,
        uint24 cycle,
        uint8 distribution,
        Color oldColor,
        Color newColor
    ) internal {
        uint64 neighbourPosition;
        uint8 neighbourIndex; // this cell, from the neighbour's point of view
        if (side == 0) {
            neighbourPosition = position.offset(0, -1);
            neighbourIndex = 2;
        } else if (side == 1) {
            neighbourPosition = position.offset(-1, 0);
            neighbourIndex = 3;
        } else if (side == 2) {
            neighbourPosition = position.offset(0, 1);
            neighbourIndex = 0;
        } else {
            neighbourPosition = position.offset(1, 0);
            neighbourIndex = 1;
        }
        (int8 enemyOrFriend, uint256 due) = _updateCell(
            CellUpdateData({
                position: neighbourPosition,
                cycle: cycle,
                neighbourIndex: neighbourIndex,
                oldColor: oldColor,
                newColor: newColor
            })
        );
        uint8 bit = uint8(1 << side);
        if (enemyOrFriend < 0) {
            cellUpdate.enemymap = cellUpdate.enemymap | bit;
        }
        cellUpdate.due += due;
        cellUpdate.delta += enemyOrFriend;

        if ((distribution >> 4) & bit == bit) {
            ownersToPay[side] = _ownerAtCycleStart(neighbourPosition, cycle);
        }
    }

    function _updateNeighbours(
        uint64 position,
        uint24 cycle,
        Color oldColor,
        Color newColor,
        uint8 distribution
    ) internal returns (int8 newDelta, uint8 newEnemyMap, uint256 numDue, address[4] memory ownersToPay) {
        CellUpdate memory cellUpdate;
        for (uint8 side = 0; side < 4; side++) {
            _updateNeighbour(ownersToPay, cellUpdate, position, side, cycle, distribution, oldColor, newColor);
        }
        newDelta = cellUpdate.delta;
        newEnemyMap = cellUpdate.enemymap;
        numDue = cellUpdate.due;
    }

    struct CellUpdateData {
        uint64 position; // position to update
        uint24 cycle;
        uint8 neighbourIndex; // index from point of view of cell being updated
        Color oldColor; // old Color of the neighbor
        Color newColor; // new color of the neighbor
    }

    /// @dev This update the cell in storage
    function _updateCell(CellUpdateData memory data) internal returns (int8 enemyOrFriend, uint256 due) {
        Cell memory cell = _cells[data.position];

        uint24 lastUpdate = cell.lastCycleUpdate;
        Color color = cell.color;
        if (color != Color.None) {
            // a coloured neighbour is a friend if it is the new colour, else an enemy
            enemyOrFriend = color == data.newColor ? int8(1) : int8(-1);
        }
        if (lastUpdate >= 1 && color != Color.None) {
            if (cell.life > 0 && lastUpdate < data.cycle) {
                (uint8 newLife, ) = _computeNewLife(lastUpdate, cell.enemyMap, cell.delta, cell.life, data.cycle);
                due = _updateCellFromNeighbor(data, cell, newLife);
            } else {
                due = _updateCellFromNeighbor(data, cell, cell.life);
            }
        }
    }

    function _updateCellFromNeighbor(
        CellUpdateData memory data,
        Cell memory cell, // cell to be updated
        uint8 newLife // new life value for the cell
    ) internal returns (uint256 due) {
        if (cell.life > 0 && newLife == 0) {
            // we just died, we establish the distributionMap and counts
            cell.distribution = (cell.enemyMap << 4) + _countBits(cell.enemyMap);
        }

        if ((cell.distribution >> 4) & (2 ** data.neighbourIndex) == 2 ** data.neighbourIndex) {
            due = cell.stake * (NUM_TOKENS_PER_GEMS / (cell.distribution & 0x0f));

            cell.distribution =
                (uint8(uint256(cell.distribution >> 4) & (~(2 ** uint256(data.neighbourIndex)))) << 4) +
                (cell.distribution & 0x0f);
        }

        int8 oldEffectiveDelta = _effectiveDelta(cell.delta, cell.enemyMap);

        _handleColor(cell, data.neighbourIndex, data.oldColor, data.newColor);

        _setCell(data.position, cell, newLife, data.cycle, oldEffectiveDelta);

        _cells[data.position] = cell;
    }

    function _setCell(
        uint64 position, // position of the cell to be updated
        Cell memory cell, // cell to be updated
        uint8 newLife, // new life value for the celll
        uint24 cycle, // cycle at which the update occured
        int8 oldEffectiveDelta
    ) internal {
        address owner = _ownerOf(position);
        if (owner != address(0) && newLife > 0) {
            int8 newEffectiveDelta = _effectiveDelta(cell.delta, cell.enemyMap);
            if (oldEffectiveDelta > 0 && newEffectiveDelta <= 0) {
                _removePoints(owner, NUM_TOKENS_PER_GEMS * cell.stake);
            } else if (oldEffectiveDelta <= 0 && newEffectiveDelta > 0) {
                _addPoints(owner, NUM_TOKENS_PER_GEMS * cell.stake);
            }
        }

        if (oldEffectiveDelta > 0) {
            cell.producingCycles += cycle - cell.lastCycleUpdate;
        }

        cell.lastCycleUpdate = cycle;
        cell.life = newLife;
    }

    function _handleColor(
        Cell memory cell, // cell to be updated
        uint8 neighbourIndex, // the neighbor triggering the update and for which we return whether it should receive its due
        Color oldColor, // old color of that neighbor
        Color newColor // new color of that neighbor
    ) internal pure {
        if (oldColor != newColor) {
            if (newColor == Color.None) {
                if (cell.color == oldColor) {
                    cell.delta -= 1;
                } else {
                    cell.delta += 1;
                    cell.enemyMap = cell.enemyMap & uint8((1 << neighbourIndex) ^ 0xFF);
                }
            } else if (cell.color == oldColor) {
                // then newColor is different (see assert above)
                cell.enemyMap = cell.enemyMap | uint8(1 << neighbourIndex);
                cell.delta -= 2;
            } else if (cell.color == newColor) {
                // then old color was different
                cell.delta += (oldColor == Color.None ? int8(1) : int8(2));
                cell.enemyMap = cell.enemyMap & uint8((1 << neighbourIndex) ^ 0xFF);
            } else if (oldColor == Color.None) {
                // if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
                cell.delta -= 1;
                cell.enemyMap = cell.enemyMap | uint8(1 << neighbourIndex);
            }
        }
    }
}

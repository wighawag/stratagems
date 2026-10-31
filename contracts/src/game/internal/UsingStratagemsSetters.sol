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
    // THE RESOLUTION: LOAD, RULE, APPLY
    //-------------------------------------------------------------------------
    //
    // A reveal's moves and a poke are resolved over a TABLE OF THE CELLS THEY
    // TOUCH, in memory (`Resolution.board`), and nothing in the rule below reads
    // or writes storage, the generator or the token: it reads a cell through the
    // table, writes it back to the table, and records what must happen (an
    // event, a generator call, a payout) in order. {_apply} then does all of it.
    //
    // WHY. The simulation route ({StratagemsSimulation}) runs the SAME rule over
    // a table a client hands it, in the client's own sandbox, from this
    // deployment's bytecode: the preview of a turn is the rule the reveal
    // applies, not a TypeScript copy of it.
    //
    // THE TABLE READS THROUGH TO STORAGE, ONE FIELD AT A TIME, the first time a
    // field of a cell is asked for, and never again. That keeps the slots a
    // reveal reads exactly the ones it read before this was a table (loading
    // every neighbour's owner and start up front would read two cold slots per
    // empty neighbour for nothing). In the sandbox there is no storage, so a cell
    // the client did not hand over reads as empty, which is what the client
    // knows of it.

    struct Entry {
        BoardCell value;
        /// @dev bits: 1 cell read, 2 owner read, 4 start read, 8 cell written,
        ///      16 owner written, 32 start written
        uint8 flags;
    }

    struct Effect {
        /// @dev 1 MoveProcessed, 2 Transfer, 3 generator add, 4 generator remove
        uint8 kind;
        uint64 position;
        address a;
        address b;
        uint256 amount;
        Color oldColor;
        Color newColor;
    }

    struct Resolution {
        Entry[] entries;
        uint256 numEntries;
        /// @dev open addressing: 0 is empty, else the entry's index plus one
        uint256[] slots;
        uint256 mask;
        uint8 maxLife;
        uint256 numTokensPerGems;
        TokenTransferCollection transfers;
        Effect[] effects;
        uint256 numEffects;
    }

    uint8 internal constant READ_CELL = 1;
    uint8 internal constant READ_OWNER = 2;
    uint8 internal constant READ_START = 4;
    uint8 internal constant WROTE_CELL = 8;
    uint8 internal constant WROTE_OWNER = 16;
    uint8 internal constant WROTE_START = 32;

    /// @param numCells how many distinct cells the table may hold
    /// @param numTransfers how many payouts the resolution may collect
    /// @param numEffects how many effects it may record
    function _newResolution(
        uint256 numCells,
        uint256 numTransfers,
        uint256 numEffects
    ) internal view returns (Resolution memory r) {
        uint256 capacity = 8;
        while (capacity < numCells * 2) capacity <<= 1;
        r.entries = new Entry[](numCells);
        r.slots = new uint256[](capacity);
        r.mask = capacity - 1;
        r.maxLife = MAX_LIFE;
        r.numTokensPerGems = NUM_TOKENS_PER_GEMS;
        r.transfers = TokenTransferCollection({transfers: new TokenTransfer[](numTransfers), numTransfers: 0});
        r.effects = new Effect[](numEffects);
    }

    /// @dev The index of `position`'s entry, created empty (nothing read) if
    ///      absent. An index rather than the entry, so a lookup allocates nothing:
    ///      memory is never freed in a transaction and its price grows with the
    ///      square of its size, so a struct returned per lookup is what a long
    ///      turn would pay most for.
    function _entryIndex(Resolution memory r, uint64 position) internal pure returns (uint256) {
        uint256 slot;
        // Masked, because the high bits of a short type are not guaranteed clean
        // inside assembly: hashed dirty, one position would land in two slots.
        assembly ("memory-safe") {
            mstore(0, and(position, 0xffffffffffffffff))
            slot := keccak256(0, 32)
        }
        slot &= r.mask;
        while (true) {
            uint256 index = r.slots[slot];
            if (index == 0) {
                index = r.numEntries;
                r.entries[index].value.position = position;
                r.numEntries = index + 1;
                r.slots[slot] = index + 1;
                return index;
            }
            if (r.entries[index - 1].value.position == position) {
                return index - 1;
            }
            slot = (slot + 1) & r.mask;
        }
    }

    // The three reads. `view` only because they read through: in the simulation
    // route every field asked for has been handed over and marked read.
    //
    // THEY RETURN THE TABLE'S OWN STRUCT, not a copy, and every caller either
    // copies before changing it ({_projectCell}) or changes it and writes the
    // same struct back with nothing reading the cell in between, which is what
    // the storage version of this code did with its memory copy.

    function _cellOf(Resolution memory r, uint64 position) internal view returns (Cell memory) {
        Entry memory e = r.entries[_entryIndex(r, position)];
        if (e.flags & READ_CELL == 0) {
            e.value.cell = _cells[position];
            e.flags |= READ_CELL;
        }
        return e.value.cell;
    }

    function _ownerIn(Resolution memory r, uint64 position) internal view returns (address) {
        Entry memory e = r.entries[_entryIndex(r, position)];
        if (e.flags & READ_OWNER == 0) {
            e.value.owner = _ownerOf(position);
            e.flags |= READ_OWNER;
        }
        return e.value.owner;
    }

    function _startIn(Resolution memory r, uint64 position) internal view returns (CellAtCycleStart memory) {
        Entry memory e = r.entries[_entryIndex(r, position)];
        if (e.flags & READ_START == 0) {
            e.value.start = _cellsAtCycleStart[position];
            e.flags |= READ_START;
        }
        return e.value.start;
    }

    function _setCellIn(Resolution memory r, uint64 position, Cell memory cell) internal pure {
        Entry memory e = r.entries[_entryIndex(r, position)];
        e.value.cell = cell;
        e.flags |= READ_CELL | WROTE_CELL;
    }

    function _setOwnerIn(Resolution memory r, uint64 position, address owner) internal pure {
        Entry memory e = r.entries[_entryIndex(r, position)];
        e.value.owner = owner;
        e.flags |= READ_OWNER | WROTE_OWNER;
    }

    function _setStartIn(Resolution memory r, uint64 position, CellAtCycleStart memory start) internal pure {
        Entry memory e = r.entries[_entryIndex(r, position)];
        e.value.start = start;
        e.flags |= READ_START | WROTE_START;
    }

    /// @dev See {_ownerAtCycleStart}, over the table.
    function _ownerAtCycleStartIn(Resolution memory r, uint64 position, uint24 cycle) internal view returns (address) {
        CellAtCycleStart memory start = _startIn(r, position);
        if (start.cycle == cycle) {
            return start.owner;
        }
        return _ownerIn(r, position);
    }

    function _record(Resolution memory r, Effect memory effect) internal pure {
        r.effects[r.numEffects] = effect;
        r.numEffects++;
    }

    function _recordGenerator(Resolution memory r, bool add, address owner, uint256 amount) internal pure {
        _record(
            r,
            Effect({
                kind: add ? 3 : 4,
                position: 0,
                a: owner,
                b: address(0),
                amount: amount,
                oldColor: Color.None,
                newColor: Color.None
            })
        );
    }

    /// @notice Do what the rule decided: the cells, owners and starts it wrote,
    ///         then its events and generator calls in the order it made them,
    ///         then the payouts.
    function _apply(Resolution memory r) internal {
        for (uint256 i = 0; i < r.numEntries; i++) {
            Entry memory e = r.entries[i];
            uint64 position = e.value.position;
            if (e.flags & WROTE_CELL != 0) {
                _cells[position] = e.value.cell;
            }
            if (e.flags & WROTE_OWNER != 0) {
                _owners[position] = uint256(uint160(e.value.owner));
            }
            if (e.flags & WROTE_START != 0) {
                _cellsAtCycleStart[position] = e.value.start;
            }
        }
        for (uint256 i = 0; i < r.numEffects; i++) {
            Effect memory effect = r.effects[i];
            if (effect.kind == 1) {
                emit MoveProcessed(effect.position, effect.a, effect.oldColor, effect.newColor);
            } else if (effect.kind == 2) {
                emit Transfer(effect.a, effect.b, effect.position);
            } else if (effect.kind == 3) {
                GENERATOR.add(effect.a, effect.amount);
            } else {
                GENERATOR.remove(effect.a, effect.amount);
            }
        }
        _multiTransfer(TOKENS, r.transfers);
    }

    /// @dev The most a move records: its MoveProcessed, a Transfer, two
    ///      generator calls for its own cell and one for each neighbour.
    uint256 internal constant EFFECTS_PER_MOVE = 8;

    //-------------------------------------------------------------------------
    // MOVES
    //-------------------------------------------------------------------------

    /// @return cost what the moves cost: one gem per placed move
    function _resolveMoves(address player, uint24 cycle, Move[] memory moves) internal returns (uint256 cost) {
        // max number of transfer is (4+1) * moves.length
        // (for each move's cell's neighbours potentially being a different account)
        Resolution memory r = _newResolution(moves.length * 5, moves.length * 5 + 1, moves.length * EFFECTS_PER_MOVE);
        cost = _resolveMovesIn(r, player, cycle, moves);
        _apply(r);
    }

    /// @notice THE RULE OF A TURN: what `moves` do, over the table.
    function _resolveMovesIn(
        Resolution memory r,
        address player,
        uint24 cycle,
        Move[] memory moves
    ) internal view returns (uint256 cost) {
        MoveTokens memory tokens;
        for (uint256 i = 0; i < moves.length; i++) {
            (uint256 placed, uint256 returned) = _computeMove(r, player, cycle, moves[i]);
            tokens.tokensPlaced += placed;
            tokens.tokensReturned += returned;
        }
        if (tokens.tokensReturned != 0) {
            _collectTransfer(r.transfers, TokenTransfer({to: payable(player), amount: tokens.tokensReturned}));
        }
        cost = tokens.tokensPlaced;
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
        Resolution memory r,
        address player,
        uint24 cycle,
        Move memory move
    ) internal view returns (uint256 tokensPlaced, uint256 tokensReturned) {
        (Cell memory currentState, bool justDied) = _projectCell(_cellOf(r, move.position), cycle, r.maxLife);

        CellAtCycleStart memory start = _startIn(r, move.position);
        bool firstMoveThisCycle = start.cycle != cycle;
        if (firstMoveThisCycle) {
            // no move of this cycle has touched it, so the current record is
            // its state at the cycle's start (a neighbour's move changes
            // neither its life at this cycle nor its owner)
            start = CellAtCycleStart({owner: _ownerIn(r, move.position), cycle: cycle, life: currentState.life});
        }

        // the validity of the move, against the cycle's start
        if (start.life != 0) {
            // alive at the start: its owner's alone this cycle
            if (start.owner != player) {
                return (0, 0);
            }
            if (move.color == Color.None) {
                if (start.life != r.maxLife || currentState.life == 0 || _ownerIn(r, move.position) != player) {
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
            _setStartIn(r, move.position, start);
        }

        // we might have distribution still to do
        uint8 distribution = currentState.distribution;
        if (justDied) {
            // if we just died, we have to distribute to all
            distribution = (currentState.enemyMap << 4) + _countBits(currentState.enemyMap);
            currentState.lastCycleUpdate = 0;
        }

        if (move.color == Color.None) {
            tokensReturned = r.numTokensPerGems;
        }

        _record(
            r,
            Effect({
                kind: 1,
                position: move.position,
                a: player,
                b: address(0),
                amount: 0,
                oldColor: currentState.color,
                newColor: move.color
            })
        );

        tokensPlaced = _completeMove(r, player, cycle, move, currentState, distribution, start.owner);
    }

    function _completeMove(
        Resolution memory r,
        address player,
        uint24 cycle,
        Move memory move,
        Cell memory currentState,
        uint8 distribution,
        address ownerAtStart
    ) internal view returns (uint256 tokensPlaced) {
        unchecked {
            (int8 newDelta, uint8 newEnemyMap) = _propagate(
                r,
                move,
                cycle,
                currentState.color,
                distribution,
                currentState.stake,
                ownerAtStart
            );

            address currentOwner = _ownerIn(r, move.position);
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
                _setPoints(r, currentOwner, oldLife, oldStake, oldEffectiveDelta, address(0), 0, 0, 0);
                _record(
                    r,
                    Effect({
                        kind: 2,
                        position: move.position,
                        a: currentOwner,
                        b: address(0),
                        amount: 0,
                        oldColor: Color.None,
                        newColor: Color.None
                    })
                );
                _setOwnerIn(r, move.position, address(0));
            } else {
                tokensPlaced = r.numTokensPerGems;
                _placeColor(r, player, currentOwner, currentState, move, cycle, newDelta, newEnemyMap);
            }

            _setCellIn(r, move.position, currentState);
        }
    }

    function _placeColor(
        Resolution memory r,
        address player,
        address oldOwner,
        Cell memory currentState,
        Move memory move,
        uint24 cycle,
        int8 newDelta,
        uint8 newEnemyMap
    ) internal pure {
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
            r,
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
            _record(
                r,
                Effect({
                    kind: 2,
                    position: move.position,
                    a: oldOwner,
                    b: newOwner,
                    amount: 0,
                    oldColor: Color.None,
                    newColor: Color.None
                })
            );
        }
        _setOwnerIn(r, move.position, newOwner);
    }

    /// @notice Move a cell's points from its old holding to its new one.
    /// @dev An owner holds `NUM_TOKENS_PER_GEMS * stake` exactly while the cell
    ///      is alive with a positive effective delta. alpha1 computed the
    ///      difference case by case, and missed some (a third placement on an
    ///      Evil cell whose delta changed in between).
    function _setPoints(
        Resolution memory r,
        address oldOwner,
        uint8 oldLife,
        uint8 oldStake,
        int8 oldEffectiveDelta,
        address newOwner,
        uint8 newLife,
        uint8 newStake,
        int8 newEffectiveDelta
    ) internal pure {
        uint256 oldHolding = oldOwner != address(0) && oldLife > 0 && oldEffectiveDelta > 0
            ? r.numTokensPerGems * oldStake
            : 0;
        uint256 newHolding = newOwner != address(0) && newLife > 0 && newEffectiveDelta > 0
            ? r.numTokensPerGems * newStake
            : 0;
        if (oldOwner == newOwner) {
            if (newHolding > oldHolding) {
                _recordGenerator(r, true, newOwner, newHolding - oldHolding);
            } else if (oldHolding > newHolding) {
                _recordGenerator(r, false, oldOwner, oldHolding - newHolding);
            }
        } else {
            if (oldHolding != 0) {
                _recordGenerator(r, false, oldOwner, oldHolding);
            }
            if (newHolding != 0) {
                _recordGenerator(r, true, newOwner, newHolding);
            }
        }
    }

    function _propagate(
        Resolution memory r,
        Move memory move,
        uint24 cycle,
        Color color,
        uint8 distribution,
        uint8 stake,
        address ownerAtStart
    ) internal view returns (int8 newDelta, uint8 newEnemyMap) {
        (
            int8 newComputedDelta,
            uint8 newComputedEnemyMap,
            uint256 numDue,
            address[4] memory ownersToPay
        ) = _updateNeighbours(r, move.position, cycle, color, move.color, distribution);

        _payShares(r, ownerAtStart, numDue, ownersToPay, stake, distribution);
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
        Resolution memory r,
        address owner,
        uint256 due,
        address[4] memory ownersToPay,
        uint8 stake,
        uint8 distribution
    ) internal pure {
        if (due > 0) {
            _collectTransfer(r.transfers, TokenTransfer({to: payable(owner), amount: due}));
        }
        for (uint8 i = 0; i < 4; i++) {
            if (ownersToPay[i] != address(0)) {
                _collectTransfer(
                    r.transfers,
                    TokenTransfer({
                        to: payable(ownersToPay[i]),
                        amount: stake * (r.numTokensPerGems / (distribution & 0x0f))
                    })
                );
            }
        }
    }

    /// @dev The most a poke records: one generator call for each neighbour.
    uint256 internal constant EFFECTS_PER_POKE = 4;

    function _pokeIn(Resolution memory r, uint64 position, uint24 cycle) internal view {
        (Cell memory currentState, bool justDied) = _projectCell(_cellOf(r, position), cycle, r.maxLife);

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
            r,
            position,
            cycle,
            currentState.color,
            currentState.color,
            distribution
        );

        _payShares(
            r,
            _ownerAtCycleStartIn(r, position, cycle),
            numDue,
            ownersToPay,
            currentState.stake,
            distribution
        );

        currentState.distribution = 0;
        _setCellIn(r, position, currentState);
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
        Resolution memory r,
        address[4] memory ownersToPay,
        CellUpdate memory cellUpdate,
        uint64 position,
        uint8 side,
        uint24 cycle,
        uint8 distribution,
        Color oldColor,
        Color newColor
    ) internal view {
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
            r,
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
            ownersToPay[side] = _ownerAtCycleStartIn(r, neighbourPosition, cycle);
        }
    }

    function _updateNeighbours(
        Resolution memory r,
        uint64 position,
        uint24 cycle,
        Color oldColor,
        Color newColor,
        uint8 distribution
    ) internal view returns (int8 newDelta, uint8 newEnemyMap, uint256 numDue, address[4] memory ownersToPay) {
        CellUpdate memory cellUpdate;
        for (uint8 side = 0; side < 4; side++) {
            _updateNeighbour(r, ownersToPay, cellUpdate, position, side, cycle, distribution, oldColor, newColor);
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

    /// @dev This updates the cell in the table
    function _updateCell(
        Resolution memory r,
        CellUpdateData memory data
    ) internal view returns (int8 enemyOrFriend, uint256 due) {
        Cell memory cell = _cellOf(r, data.position);

        uint24 lastUpdate = cell.lastCycleUpdate;
        Color color = cell.color;
        if (color != Color.None) {
            // a coloured neighbour is a friend if it is the new colour, else an enemy
            enemyOrFriend = color == data.newColor ? int8(1) : int8(-1);
        }
        if (lastUpdate >= 1 && color != Color.None) {
            if (cell.life > 0 && lastUpdate < data.cycle) {
                (uint8 newLife, ) = _computeNewLifeWith(
                    r.maxLife,
                    lastUpdate,
                    cell.enemyMap,
                    cell.delta,
                    cell.life,
                    data.cycle
                );
                due = _updateCellFromNeighbor(r, data, cell, newLife);
            } else {
                due = _updateCellFromNeighbor(r, data, cell, cell.life);
            }
        }
    }

    function _updateCellFromNeighbor(
        Resolution memory r,
        CellUpdateData memory data,
        Cell memory cell, // cell to be updated
        uint8 newLife // new life value for the cell
    ) internal view returns (uint256 due) {
        if (cell.life > 0 && newLife == 0) {
            // we just died, we establish the distributionMap and counts
            cell.distribution = (cell.enemyMap << 4) + _countBits(cell.enemyMap);
        }

        if ((cell.distribution >> 4) & (2 ** data.neighbourIndex) == 2 ** data.neighbourIndex) {
            due = cell.stake * (r.numTokensPerGems / (cell.distribution & 0x0f));

            cell.distribution =
                (uint8(uint256(cell.distribution >> 4) & (~(2 ** uint256(data.neighbourIndex)))) << 4) +
                (cell.distribution & 0x0f);
        }

        int8 oldEffectiveDelta = _effectiveDelta(cell.delta, cell.enemyMap);

        _handleColor(cell, data.neighbourIndex, data.oldColor, data.newColor);

        _setCell(r, data.position, cell, newLife, data.cycle, oldEffectiveDelta);

        _setCellIn(r, data.position, cell);
    }

    function _setCell(
        Resolution memory r,
        uint64 position, // position of the cell to be updated
        Cell memory cell, // cell to be updated
        uint8 newLife, // new life value for the celll
        uint24 cycle, // cycle at which the update occured
        int8 oldEffectiveDelta
    ) internal view {
        address owner = _ownerIn(r, position);
        if (owner != address(0) && newLife > 0) {
            int8 newEffectiveDelta = _effectiveDelta(cell.delta, cell.enemyMap);
            if (oldEffectiveDelta > 0 && newEffectiveDelta <= 0) {
                _recordGenerator(r, false, owner, r.numTokensPerGems * cell.stake);
            } else if (oldEffectiveDelta <= 0 && newEffectiveDelta > 0) {
                _recordGenerator(r, true, owner, r.numTokensPerGems * cell.stake);
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

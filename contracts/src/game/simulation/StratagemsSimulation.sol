// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../internal/UsingStratagemsSetters.sol";
import "../../utils/PositionUtils.sol";

/// @notice What a turn will do, answered by the reveal's own code.
/// @dev THE SECOND PATTERN of the template's bytecode sandbox
///      (`web/src/lib/game/simulation/README.md`): for a rule that is
///      storage-heavy, the resolution is NOT restructured into a pure core
///      (measured for stratagems on 2026-10-31: +19% gas on every full chunk,
///      memory being quadratic where storage once touched is cheap). Instead
///      this contract inherits the resolution unchanged, seeds ITS OWN storage
///      with the cells a client hands it, runs `_resolveMoves` (or `_poke`) and
///      returns the touched cells after the turn, with the payouts and the point
///      changes, which it records by overriding the two hooks the resolution
///      sends them through ({_multiTransfer}, {_addPoints}, {_removePoints}).
///
///      DEPLOYED BESIDE THE GAME, with the same config (its immutables, the
///      maximum life and the tokens per gem, are the rules' parameters), and
///      NEVER as a route behind the game's proxy: it writes storage, and a
///      route writes the game's.
///
///      Called with `eth_call` (in the client's sandbox, on a bare node with this
///      contract's deployed code): its functions write, so they are not `view`,
///      and nothing they write outlives the call. Sent as a transaction, they
///      change only this contract's own storage, which every call overwrites
///      wherever it reads (the moves' cells and their neighbours), so a stale
///      record cannot reach an answer.
contract StratagemsSimulation is UsingStratagemsSetters {
    using PositionUtils for uint64;

    /// @notice A cell as the game stores it: its record, its owner, and its start record.
    /// @dev `start.cycle` zero: no move has touched it in the cycle simulated
    ///      (the record the first move of a cycle writes, {CellAtCycleStart}).
    struct StoredCell {
        uint64 position;
        address owner;
        Cell cell;
        CellAtCycleStart start;
    }

    struct Payout {
        address to;
        uint256 amount;
    }

    /// @notice One call to the generator, in the order the resolution made it.
    struct PointChange {
        address owner;
        bool added;
        uint256 amount;
    }

    struct Outcome {
        /// the moves' cells and their neighbours, each once, after the turn
        StoredCell[] cells;
        /// the transfers the resolution sends, in order (a removal's gem back to the player included)
        Payout[] payouts;
        PointChange[] points;
        /// what the moves cost: one gem per placed move
        uint256 cost;
    }

    Payout[] internal _payouts;
    PointChange[] internal _points;

    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @notice What `moves`, revealed by `player` in `cycle`, do to `board`.
    /// @param board the cells as the game stores them; a moved cell or a
    ///        neighbour of one left out is empty
    function resolveMoves(
        StoredCell[] calldata board,
        address player,
        uint24 cycle,
        Move[] calldata moves
    ) external returns (Outcome memory outcome) {
        uint64[] memory centres = new uint64[](moves.length);
        for (uint256 i = 0; i < moves.length; i++) {
            centres[i] = moves[i].position;
        }
        uint64[] memory touched = _seed(board, centres);
        outcome.cost = _resolveMoves(player, cycle, moves);
        _collect(outcome, touched);
    }

    /// @notice What poking `positions` in `cycle` does to `board`.
    function poke(
        StoredCell[] calldata board,
        uint24 cycle,
        uint64[] calldata positions
    ) external returns (Outcome memory outcome) {
        uint64[] memory touched = _seed(board, positions);
        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](positions.length * 5),
            numTransfers: 0
        });
        for (uint256 i = 0; i < positions.length; i++) {
            _poke(transferCollection, positions[i], cycle);
        }
        _multiTransfer(TOKENS, transferCollection);
        _collect(outcome, touched);
    }

    /// @notice A stored cell brought to `cycle`, as every read of the game brings it.
    /// @return cell the cell at `cycle` ({_getUpdatedCell}, what the getters return)
    /// @return justDied whether it reached zero life on the way
    function cellAtCycle(Cell calldata stored, uint24 cycle) external returns (Cell memory cell, bool justDied) {
        _cells[0] = stored;
        return _getUpdatedCell(0, cycle);
    }

    //-------------------------------------------------------------------------
    // THE HOOKS: recorded, not sent
    //-------------------------------------------------------------------------

    function _multiTransfer(IERC20, TokenTransferCollection memory transferCollection) internal override {
        for (uint256 i = 0; i < transferCollection.numTransfers; i++) {
            _payouts.push(
                Payout({to: transferCollection.transfers[i].to, amount: transferCollection.transfers[i].amount})
            );
        }
    }

    function _addPoints(address owner, uint256 amount) internal override {
        _points.push(PointChange({owner: owner, added: true, amount: amount}));
    }

    function _removePoints(address owner, uint256 amount) internal override {
        _points.push(PointChange({owner: owner, added: false, amount: amount}));
    }

    //-------------------------------------------------------------------------
    // INTERNALS
    //-------------------------------------------------------------------------

    /// @dev Every cell the resolution can read is one of `centres` or a
    ///      neighbour of one: each is cleared, then the board written over it.
    function _seed(StoredCell[] calldata board, uint64[] memory centres) internal returns (uint64[] memory touched) {
        delete _payouts;
        delete _points;
        touched = new uint64[](centres.length * 5);
        uint256 numTouched = 0;
        for (uint256 i = 0; i < centres.length; i++) {
            uint64 centre = centres[i];
            uint64[5] memory around = [
                centre,
                centre.offset(0, -1),
                centre.offset(-1, 0),
                centre.offset(0, 1),
                centre.offset(1, 0)
            ];
            for (uint256 k = 0; k < 5; k++) {
                bool seen = false;
                for (uint256 j = 0; j < numTouched; j++) {
                    if (touched[j] == around[k]) {
                        seen = true;
                        break;
                    }
                }
                if (!seen) {
                    touched[numTouched++] = around[k];
                    delete _cells[around[k]];
                    delete _owners[around[k]];
                    delete _cellsAtCycleStart[around[k]];
                }
            }
        }
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(touched, numTouched)
        }
        for (uint256 i = 0; i < board.length; i++) {
            StoredCell calldata stored = board[i];
            _cells[stored.position] = stored.cell;
            _owners[stored.position] = uint256(uint160(stored.owner));
            _cellsAtCycleStart[stored.position] = stored.start;
        }
    }

    function _collect(Outcome memory outcome, uint64[] memory touched) internal view {
        outcome.cells = new StoredCell[](touched.length);
        for (uint256 i = 0; i < touched.length; i++) {
            uint64 position = touched[i];
            outcome.cells[i] = StoredCell({
                position: position,
                owner: _ownerOf(position),
                cell: _cells[position],
                start: _cellsAtCycleStart[position]
            });
        }
        outcome.payouts = _payouts;
        outcome.points = _points;
    }
}

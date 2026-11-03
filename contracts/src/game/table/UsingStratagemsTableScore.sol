// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../internal/UsingStratagemsSetters.sol";
import "./UsingStratagemsTable.sol";
import {CommitReveal} from "../../commit-reveal/CommitReveal.sol";

/// @title A table's rules where they touch a move: the bound, the count, the
///        collisions, the credited payouts and the stake (see {UsingStratagemsTable})
abstract contract UsingStratagemsTableScore is UsingStratagemsTable, UsingStratagemsSetters {
    using PositionUtils for uint64;

    function _currentCycle()
        internal
        view
        virtual
        override(UsingStratagemsState, UsingStratagemsTable)
        returns (uint24 cycle, bool commiting)
    {
        return UsingStratagemsTable._currentCycle();
    }

    /// @notice A move outside the board is skipped: it costs nothing and changes nothing.
    function _computeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move
    ) internal virtual override returns (uint256 tokensPlaced, uint256 tokensReturned) {
        (int32 x, int32 y) = move.position.toXY();
        (int32 min, int32 max, ) = _boardBounds();
        if (x < min || x > max || y < min || y > max) {
            return (0, 0);
        }
        return super._computeMove(transferCollection, player, cycle, move);
    }

    /// @notice Counts the cells to settle, and credits what a collision cost.
    /// @dev A COLLISION IS NEUTRAL IN THE SCORE (L4-16) and unchanged in the
    ///      tokens: each placer still pays the gem the Evil cell keeps. It is
    ///      recognised from the cell before the move, as {_computeMove} does: a
    ///      cell placed on in this cycle and alive, made Evil by this move. The
    ///      collider is credited their gem, and so is the owner before the move
    ///      when it is not Evil (the first placer, whose cell this collision
    ///      took), so whichever order the reveals arrive in, every collider nets
    ///      zero. An explicit Evil placement on a free cell is no collision.
    function _completeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move,
        Cell memory currentState,
        uint8 distribution,
        address ownerAtStart
    ) internal virtual override returns (uint256 tokensPlaced) {
        Color colorBefore = currentState.color;
        bool collision = move.color == Color.Evil &&
            currentState.cycleWhenTokenIsAdded == cycle &&
            currentState.life != 0;
        address ownerBefore = _ownerOf(move.position);

        tokensPlaced = super._completeMove(
            transferCollection,
            player,
            cycle,
            move,
            currentState,
            distribution,
            ownerAtStart
        );

        TableLayout storage $ = _table();
        if (colorBefore == Color.None && move.color != Color.None) {
            $.unsettledCells += 1;
        } else if (colorBefore != Color.None && move.color == Color.None) {
            $.unsettledCells -= 1;
        }
        if (collision) {
            $.collisionCredit[uint256(uint160(player))] += NUM_TOKENS_PER_GEMS;
            if (ownerBefore != EVIL_OWNER && ownerBefore != address(0)) {
                $.collisionCredit[uint256(uint160(ownerBefore))] += NUM_TOKENS_PER_GEMS;
            }
        }
    }

    /// @notice Every payout is credited to its recipient's reserve; Evil's is sent and lost.
    /// @dev Bookkeeping only ({CommitReveal-deposit}): the tokens are here
    ///      already, and crediting does not seat anyone, so a payout to a
    ///      member who was forfeited is still theirs to withdraw once settled.
    function _multiTransfer(IERC20 token, TokenTransferCollection memory transferCollection) internal virtual override {
        for (uint256 i = 0; i < transferCollection.numTransfers; i++) {
            address to = transferCollection.transfers[i].to;
            uint256 amount = transferCollection.transfers[i].amount;
            if (to == EVIL_OWNER) {
                token.transfer(to, amount);
            } else {
                CommitReveal.deposit(uint256(uint160(to)), amount);
            }
        }
    }

    //-------------------------------------------------------------------------
    // THE STAKE
    //-------------------------------------------------------------------------

    /// @notice A seat's stake: exactly the table's amount, by someone not seated, before the start.
    function _requireSeatStake(uint256 player, uint256 amount) internal view {
        (uint256 stakeTokens, , ) = _tableOptions();
        if (amount != stakeTokens || _roster().started || _reserveOf(player) != 0) {
            revert TableStakeIsFixed(stakeTokens, amount);
        }
    }

    /// @notice Before the start a seat may be left, whole; after it, nothing leaves until settled.
    function _requireWithdrawal(uint256 player, uint256 amount) internal view {
        if (_roster().started) {
            if (!_table().settled) {
                revert TableNotSettled();
            }
        } else if (amount != _reserveOf(player)) {
            (uint256 stakeTokens, , ) = _tableOptions();
            revert TableStakeIsFixed(stakeTokens, amount);
        }
    }
}

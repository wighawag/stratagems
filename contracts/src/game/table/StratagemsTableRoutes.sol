// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../routes/StratagemsGetters.sol";
import "../routes/StratagemsCommit.sol";
import "../routes/StratagemsReveal.sol";
import "../routes/StratagemsPoke.sol";
import "./UsingStratagemsTable.sol";
import "./UsingStratagemsTableScore.sol";

// THE WORLD'S ROUTES, AT A TABLE: each the world's own code with
// {UsingStratagemsTableScore}'s hooks compiled in, which is the whole of the
// difference. The table implementation (`021_deploy_tables.ts`) deploys these
// in place of the world's; the world deploys none of them.

/// @dev Its reads see the final board after the end ({UsingStratagemsTableScore-_currentCycle}).
contract StratagemsTableGetters is StratagemsGetters, UsingStratagemsTable {
    constructor(Config memory config) StratagemsGetters(config) {}

    function _currentCycle()
        internal
        view
        override(UsingStratagemsState, UsingStratagemsTable)
        returns (uint24 cycle, bool commiting)
    {
        return UsingStratagemsTable._currentCycle();
    }
}

/// @dev The stake is fixed, and nothing leaves until the table is settled.
contract StratagemsTableCommit is StratagemsCommit, UsingStratagemsTableScore {
    constructor(Config memory config) StratagemsCommit(config) {}

    function _currentCycle()
        internal
        view
        override(UsingStratagemsState, UsingStratagemsTableScore)
        returns (uint24 cycle, bool commiting)
    {
        return UsingStratagemsTableScore._currentCycle();
    }

    function _computeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move
    ) internal override(UsingStratagemsSetters, UsingStratagemsTableScore) returns (uint256, uint256) {
        return UsingStratagemsTableScore._computeMove(transferCollection, player, cycle, move);
    }

    function _completeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move,
        Cell memory currentState,
        uint8 distribution,
        address ownerAtStart
    ) internal override(UsingStratagemsSetters, UsingStratagemsTableScore) returns (uint256) {
        return
            UsingStratagemsTableScore._completeMove(
                transferCollection,
                player,
                cycle,
                move,
                currentState,
                distribution,
                ownerAtStart
            );
    }

    function _multiTransfer(
        IERC20 token,
        TokenTransferCollection memory transferCollection
    ) internal override(UsingStratagemsUtils, UsingStratagemsTableScore) {
        UsingStratagemsTableScore._multiTransfer(token, transferCollection);
    }

    /// @inheritdoc IStratagemsCommit
    function addToReserve(uint256 player, uint256 tokensAmountToAdd) external override {
        _requireSeatStake(player, tokensAmountToAdd);
        _addToReserve(player, tokensAmountToAdd);
        TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
    }

    /// @inheritdoc IStratagemsCommit
    function addToReserveAndFund(
        uint256 player,
        uint256 tokensAmountToAdd,
        address payable stipendTo
    ) external payable override {
        _requireSeatStake(player, tokensAmountToAdd);
        _addToReserve(player, tokensAmountToAdd);
        TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
        if (msg.value != 0) {
            if (stipendTo == address(0)) {
                revert StipendWithoutRecipient();
            }
            (bool sent, ) = stipendTo.call{value: msg.value}("");
            if (!sent) {
                revert StipendNotSent(stipendTo, msg.value);
            }
        }
    }

    /// @inheritdoc IStratagemsCommit
    /// @dev A top-up is refused: a seat holds exactly the table's stake.
    function makeCommitmentWithExtraReserve(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond,
        uint256 tokensAmountToAdd,
        address payable payee
    ) external payable override {
        if (tokensAmountToAdd != 0) {
            (uint256 stakeTokens, , ) = _tableOptions();
            revert TableStakeIsFixed(stakeTokens, tokensAmountToAdd);
        }
        _makeCommitment(_playerOf(msg.sender, player), commitmentHash, bond);
        if (payee != address(0) && msg.value != 0) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsCommit
    function withdrawFromReserve(uint256 amount) external override {
        uint256 player = uint256(uint160(msg.sender));
        if (amount == type(uint256).max) {
            Commitment memory commitment = _commitmentOf(player);
            amount = _reserveOf(player) - (commitment.cycleNumber == 0 ? 0 : commitment.bond);
        }
        _requireWithdrawal(player, amount);
        if (amount > 0) {
            _withdrawFromReserve(player, amount);
            TOKENS.transfer(msg.sender, amount);
        }
    }
}

/// @dev Its moves are bounded, counted and credited to reserves.
contract StratagemsTableReveal is StratagemsReveal, UsingStratagemsTableScore {
    constructor(Config memory config) StratagemsReveal(config) {}

    function _currentCycle()
        internal
        view
        override(UsingStratagemsState, UsingStratagemsTableScore)
        returns (uint24 cycle, bool commiting)
    {
        return UsingStratagemsTableScore._currentCycle();
    }

    function _computeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move
    ) internal override(UsingStratagemsSetters, UsingStratagemsTableScore) returns (uint256, uint256) {
        return UsingStratagemsTableScore._computeMove(transferCollection, player, cycle, move);
    }

    function _completeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move,
        Cell memory currentState,
        uint8 distribution,
        address ownerAtStart
    ) internal override(UsingStratagemsSetters, UsingStratagemsTableScore) returns (uint256) {
        return
            UsingStratagemsTableScore._completeMove(
                transferCollection,
                player,
                cycle,
                move,
                currentState,
                distribution,
                ownerAtStart
            );
    }

    function _multiTransfer(
        IERC20 token,
        TokenTransferCollection memory transferCollection
    ) internal override(UsingStratagemsUtils, UsingStratagemsTableScore) {
        UsingStratagemsTableScore._multiTransfer(token, transferCollection);
    }
}

/// @dev Its pokes see the final board after the end, and credit reserves.
contract StratagemsTablePoke is StratagemsPoke, UsingStratagemsTableScore {
    constructor(Config memory config) StratagemsPoke(config) {}

    function _currentCycle()
        internal
        view
        override(UsingStratagemsState, UsingStratagemsTableScore)
        returns (uint24 cycle, bool commiting)
    {
        return UsingStratagemsTableScore._currentCycle();
    }

    function _computeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move
    ) internal override(UsingStratagemsSetters, UsingStratagemsTableScore) returns (uint256, uint256) {
        return UsingStratagemsTableScore._computeMove(transferCollection, player, cycle, move);
    }

    function _completeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 cycle,
        Move memory move,
        Cell memory currentState,
        uint8 distribution,
        address ownerAtStart
    ) internal override(UsingStratagemsSetters, UsingStratagemsTableScore) returns (uint256) {
        return
            UsingStratagemsTableScore._completeMove(
                transferCollection,
                player,
                cycle,
                move,
                currentState,
                distribution,
                ownerAtStart
            );
    }

    function _multiTransfer(
        IERC20 token,
        TokenTransferCollection memory transferCollection
    ) internal override(UsingStratagemsUtils, UsingStratagemsTableScore) {
        UsingStratagemsTableScore._multiTransfer(token, transferCollection);
    }
}

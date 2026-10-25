// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsSetters.sol";

contract StratagemsCommit is IStratagemsCommit, UsingStratagemsSetters {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @inheritdoc IStratagemsCommit
    function addToReserve(uint256 player, uint256 tokensAmountToAdd) external {
        if (tokensAmountToAdd > 0) {
            _addToReserve(player, tokensAmountToAdd);
            TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
        }
    }

    /// @inheritdoc IStratagemsCommit
    function makeCommitment(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond,
        address payable payee
    ) external payable {
        _makeCommitment(_playerOf(msg.sender, player), commitmentHash, bond);
        if (payee != address(0) && msg.value != 0) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsCommit
    function makeCommitmentWithExtraReserve(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond,
        uint256 tokensAmountToAdd,
        address payable payee
    ) external payable {
        uint256 resolved = _playerOf(msg.sender, player);
        if (tokensAmountToAdd > 0) {
            _addToReserve(resolved, tokensAmountToAdd);
            TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
        }
        _makeCommitment(resolved, commitmentHash, bond);
        if (payee != address(0) && msg.value != 0) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsCommit
    function cancelCommitment(uint256 player) external {
        _cancelCommitment(_playerOf(msg.sender, player));
    }

    /// @inheritdoc IStratagemsCommit
    function withdrawFromReserve(uint256 amount) external {
        uint256 player = uint256(uint160(msg.sender));
        if (amount == type(uint256).max) {
            // everything no commitment bonds
            Commitment memory commitment = _commitmentOf(player);
            amount = _reserveOf(player) - (commitment.cycleNumber == 0 ? 0 : commitment.bond);
        }
        if (amount > 0) {
            _withdrawFromReserve(player, amount);
            TOKENS.transfer(msg.sender, amount);
        }
    }
}

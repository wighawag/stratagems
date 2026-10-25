// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsSetters.sol";

contract StratagemsReveal is IStratagemsReveal, UsingStratagemsSetters {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @inheritdoc IStratagemsReveal
    function reveal(
        uint256 player,
        Move[] calldata moves,
        bytes32 secret,
        bytes24 furtherActions,
        address payable payee
    ) external payable {
        _reveal(player, moves, secret, furtherActions);
        if (payee != address(0) && msg.value != 0) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsReveal
    function acknowledgeMissedReveal(
        uint256 player,
        Move[] calldata moves,
        bytes32 secret,
        bytes24 furtherActions
    ) external {
        _acknowledgeMissedReveal(player, moves, secret, furtherActions);
    }

    /// @inheritdoc IStratagemsReveal
    function forfeitMissedReveal(uint256 player) external {
        _forfeitMissedReveal(msg.sender, player);
    }

    /// @inheritdoc IStratagemsReveal
    function advanceCycle() external returns (uint64 cycleNumber, bool commiting) {
        return _advanceCycle();
    }
}

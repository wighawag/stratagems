// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./TestTokens.sol";

/// @notice Anyone may take `amountPerTopup` test gems, any number of times: how a
///         player gets gems where nothing is worth money (the local chain, the
///         offline world, and the `alpha2` test deployment). The deploy sizes it
///         at one stake, so a new player presses once.
contract TestTokensInfiniteDistributor {
    TestTokens public immutable tokens;
    uint256 public immutable amountPerTopup;

    constructor(TestTokens tokensToMint, uint256 amount) {
        tokens = tokensToMint;
        amountPerTopup = amount;
    }

    function topup() external {
        tokens.mint(msg.sender, amountPerTopup);
    }
}

// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./TestTokens.sol";

contract TestTokensInfiniteDistributor {
    TestTokens public immutable tokens;

    constructor(TestTokens tokensToMint) {
        tokens = tokensToMint;
    }

    function topup() external {
        tokens.mint(msg.sender, 15 ether);
    }
}

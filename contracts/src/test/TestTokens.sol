// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "solidity-kit/solc_0.8/ERC20/implementations/ERC20Base.sol";
import "solidity-kit/solc_0.8/ERC20/ERC2612/implementations/UsingPermitWithDynamicChainID.sol";

contract TestTokens is ERC20Base, UsingPermitWithDynamicChainID {
    error WrongFee();

    uint256 public immutable fee;
    address payable public feeReceiver;

    struct Config {
        uint256 fee;
        address payable feeReceiver;
    }

    constructor(address to, uint256 amount, Config memory config) UsingPermitWithDynamicChainID(address(this)) {
        fee = config.fee;
        feeReceiver = config.feeReceiver;
        _mint(to, amount);
    }

    string public constant symbol = "TOKEN";

    function name() public pure override(IERC20, Named) returns (string memory) {
        return "Tokens";
    }

    function topup() external payable {
        if (msg.value != fee) {
            revert WrongFee();
        }
        if (fee > 0) {
            feeReceiver.transfer(msg.value);
        }
        _mint(msg.sender, 15 ether);
    }
}

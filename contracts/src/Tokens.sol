// SPDX-License-Identifier: AGPL-1.0
pragma solidity 0.8.13;

import "solidity-kit/src/ERC20/implementations/ERC20Base.sol";
import "solidity-kit/src/ERC20/ERC2612/implementations/UsingPermitWithDynamicChainId.sol";

contract Tokens is ERC20Base, UsingPermitWithDynamicChainId {
	constructor(address to, uint256 amount) UsingPermitWithDynamicChainId() {
		_mint(to, amount);
	}

	string public constant symbol = "TOKENS";

	function name() public pure override returns (string memory) {
		return "Tokens";
	}
}

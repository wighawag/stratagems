// SPDX-License-Identifier: AGPL-1.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/ERC20/implementations/ERC20Base.sol';
import 'solidity-kit/solc_0.8/ERC20/ERC2612/implementations/UsingPermitWithDynamicChainID.sol';

contract Gems is ERC20Base, UsingPermitWithDynamicChainID {
	constructor(address to, uint256 amount) UsingPermitWithDynamicChainID(address(this)) {
		_mint(to, amount);
	}

	string public constant symbol = 'GEM';

	function name() public pure override(IERC20, Named) returns (string memory) {
		return 'Gems';
	}
}

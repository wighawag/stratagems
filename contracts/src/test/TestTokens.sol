// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "solidity-kit/solc_0.8/ERC20/implementations/ERC20Base.sol";
import "solidity-kit/solc_0.8/ERC20/ERC2612/implementations/UsingPermitWithDynamicChainID.sol";
import "solidity-kit/solc_0.8/ERC20/ERC2612/implementations/UsingPermitWithDynamicChainID.sol";

contract TestTokens is ERC20Base, UsingPermitWithDynamicChainID {
    error NotAuthorized();

    event MinterAuthorized(address indexed account, bool authorized);

    Config public config;

    mapping(address => bool) public authorizedMinters;

    struct Config {
        address admin;
    }

    constructor(address to, uint256 amount, Config memory initialConfig) UsingPermitWithDynamicChainID(address(this)) {
        config = initialConfig;
        _mint(to, amount);
        _authorizeMinter(initialConfig.admin, true);
    }

    string public constant symbol = "TOKEN";

    function name() public pure override(IERC20, Named) returns (string memory) {
        return "Tokens";
    }

    function setConfig(Config memory newConfig) external {
        if (msg.sender != config.admin) {
            revert NotAuthorized();
        }
        config = newConfig;
    }

    function authorizeMinters(address[] calldata accounts, bool authorized) external {
        if (msg.sender != config.admin) {
            revert NotAuthorized();
        }
        for (uint256 i = 0; i < accounts.length; i++) {
            _authorizeMinter(accounts[i], authorized);
        }
    }

    function mint(address to, uint256 amount) external {
        if (!authorizedMinters[msg.sender]) {
            revert NotAuthorized();
        }
        _mint(to, amount);
    }

    // --------------------------------------------------------------------------------------------
    // INTERNALS
    // --------------------------------------------------------------------------------------------

    function _authorizeMinter(address account, bool authorized) internal {
        authorizedMinters[account] = authorized;
        emit MinterAuthorized(account, authorized);
    }
}

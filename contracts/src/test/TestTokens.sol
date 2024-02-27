// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "solidity-kit/solc_0_8/ERC20/implementations/ERC20Base.sol";
import "solidity-kit/solc_0_8/ERC20/ERC2612/implementations/UsingPermitWithDynamicChainID.sol";
import "solidity-kit/solc_0_8/ERC20/ERC2612/implementations/UsingPermitWithDynamicChainID.sol";

contract TestTokens is ERC20Base, UsingPermitWithDynamicChainID {
    error NotAuthorized();

    event MinterAuthorized(address indexed account, bool authorized);

    event GlobalApproval(address indexed account, bool approved);

    Config public config;

    mapping(address => bool) public authorizedMinters;
    mapping(address => bool) public globalApprovals;

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

    function authorizeGlobalApprovals(address[] calldata accounts, bool approved) external {
        if (msg.sender != config.admin) {
            revert NotAuthorized();
        }
        for (uint256 i = 0; i < accounts.length; i++) {
            _authorizeGlobalApproval(accounts[i], approved);
        }
    }

    function mint(address to, uint256 amount) external {
        if (!authorizedMinters[msg.sender]) {
            revert NotAuthorized();
        }
        _mint(to, amount);
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        if (globalApprovals[spender]) {
            return type(uint256).max;
        } else {
            // copied from ERC20Base
            if (owner == address(this)) {
                // see transferFrom: address(this) allows anyone
                return type(uint256).max;
            }
            return _allowances[owner][spender];
        }
    }

    // --------------------------------------------------------------------------------------------
    // PREVENT player to amass token on one address by claiming from multiple links
    // --------------------------------------------------------------------------------------------

    mapping(address => bool) public authorized;
    bool public requireAuthorization;
    mapping(address => bool) public touched;

    function anyNotAuthorized(address[] memory accounts) external view returns (bool) {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (!authorized[accounts[i]]) {
                return true;
            }
        }
        return false;
    }

    function authorize(address[] memory accounts, bool auth) public {
        if (msg.sender != config.admin) {
            revert NotAuthorized();
        }
        for (uint256 i = 0; i < accounts.length; i++) {
            authorized[accounts[i]] = auth;
        }
    }

    function enableRequireAuthorization(address[] calldata accounts) external {
        if (msg.sender != config.admin) {
            revert NotAuthorized();
        }
        setRequireAuthorization(true);
        authorize(accounts, true);
    }

    function setRequireAuthorization(bool req) public {
        if (msg.sender != config.admin) {
            revert NotAuthorized();
        }
        requireAuthorization = req;
    }
    // --------------------------------------------------------------------------------------------

    // --------------------------------------------------------------------------------------------
    // INTERNALS
    // --------------------------------------------------------------------------------------------

    function _authorizeMinter(address account, bool authorized) internal {
        authorizedMinters[account] = authorized;
        emit MinterAuthorized(account, authorized);
    }

    function _authorizeGlobalApproval(address account, bool approved) internal {
        globalApprovals[account] = approved;
        emit GlobalApproval(account, approved);
    }

    function _transferFrom(address from, address to, uint256 amount) internal override {
        if (globalApprovals[msg.sender]) {
            _transfer(from, to, amount);
        } else {
            super._transferFrom(from, to, amount);
        }
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        require(!touched[to] || !requireAuthorization || authorized[from] || authorized[to], "NOT_AUTHORIZED_TRANSFER");
        super._transfer(from, to, amount);
        touched[to] = true;
    }
}

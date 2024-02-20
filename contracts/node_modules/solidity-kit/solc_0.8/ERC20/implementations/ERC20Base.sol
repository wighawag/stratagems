// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC20.sol";
import "../interfaces/IERC20WithCallback.sol";
import "../interfaces/IERC20WithDistribution.sol";
import "./ImplementingERC20Internal.sol";
import "../../utils/Constants.sol";

abstract contract ERC20Base is IERC20, IERC20WithCallback, IERC20WithDistribution, ImplementingERC20Internal {
    uint256 internal _totalSupply;
    mapping(address => uint256) internal _balances;
    mapping(address => mapping(address => uint256)) internal _allowances;

    /// @inheritdoc IERC20
    function totalSupply() external view override returns (uint256) {
        return _internal_totalSupply();
    }

    /// @inheritdoc IERC20
    function balanceOf(address owner) external view override returns (uint256) {
        return _balances[owner];
    }

    /// @inheritdoc IERC20
    function allowance(address owner, address spender) external view override returns (uint256) {
        if (owner == address(this)) {
            // see transferFrom: address(this) allows anyone
            return type(uint256).max;
        }
        return _allowances[owner][spender];
    }

    /// @inheritdoc IERC20
    function decimals() external pure virtual override returns (uint8) {
        return uint8(18);
    }

    /// @inheritdoc IERC20
    function transfer(address to, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @inheritdoc IERC20WithDistribution
    function transferAlongWithETH(address payable to, uint256 amount) external payable returns (bool) {
        _transfer(msg.sender, to, amount);
        to.transfer(msg.value);
        return true;
    }

    /// @inheritdoc IERC20WithDistribution
    function distributeAlongWithETH(address payable[] memory tos, uint256 totalAmount) external payable returns (bool) {
        uint256 val = msg.value / tos.length;
        if (msg.value != val * tos.length) {
            revert InvalidMsgValue(msg.value, val * tos.length);
        }
        uint256 amount = totalAmount / tos.length;
        if (totalAmount != amount * tos.length) {
            revert InvalidTotalAmount(totalAmount, amount * tos.length);
        }
        for (uint256 i = 0; i < tos.length; i++) {
            _transfer(msg.sender, tos[i], amount);
            tos[i].transfer(val);
        }
        return true;
    }

    /// @inheritdoc IERC20WithCallback
    function transferAndCall(
        address to,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return ITransferReceiver(to).onTokenTransfer(msg.sender, amount, data);
    }

    /// @inheritdoc IERC20WithCallback
    function transferFromAndCall(
        address from,
        address to,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        _transferFrom(from, to, amount);
        return ITransferReceiver(to).onTokenTransfer(from, amount, data);
    }

    /// @inheritdoc IERC20WithCallback
    function transferOnBehalfAndCall(
        address forAddress,
        address to,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return ITransferOnBehalfReceiver(to).onTokenTransferedOnBehalf(msg.sender, forAddress, amount, data);
    }

    /// @inheritdoc IERC20
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external override returns (bool) {
        _transferFrom(from, to, amount);
        return true;
    }

    /// @inheritdoc IERC20
    function approve(address spender, uint256 amount) external override returns (bool) {
        _approveFor(msg.sender, spender, amount);
        return true;
    }

    /// @inheritdoc IERC20WithCallback
    function approveAndCall(
        address spender,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        _approveFor(msg.sender, spender, amount);
        return IApprovalReceiver(spender).onTokenApproval(msg.sender, amount, data);
    }

    // ------------------------------------------------------------------------------------------------------------------
    // INTERNALS
    // ------------------------------------------------------------------------------------------------------------------

    function _internal_totalSupply() internal view override returns (uint256) {
        return _totalSupply;
    }

    function _approveFor(
        address owner,
        address spender,
        uint256 amount
    ) internal override {
        if (owner == address(0) || spender == address(0)) {
            revert InvalidAddress(address(0));
        }
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _transferFrom(
        address from,
        address to,
        uint256 amount
    ) internal {
        // anybody can transfer from this
        // this allow mintAndApprovedCall without gas overhead
        if (msg.sender != from && from != address(this)) {
            uint256 currentAllowance = _allowances[from][msg.sender];
            if (currentAllowance != type(uint256).max) {
                // save gas when allowance is maximal by not reducing it (see https://github.com/ethereum/EIPs/issues/717)
                if (currentAllowance < amount) {
                    revert NotAuthorizedAllowance(currentAllowance, amount);
                }
                _allowances[from][msg.sender] = currentAllowance - amount;
            }
        }
        _transfer(from, to, amount);
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal {
        if (to == address(0) || to == address(this)) {
            revert InvalidAddress(to);
        }
        uint256 currentBalance = _balances[from];
        if (currentBalance < amount) {
            revert NotEnoughTokens(currentBalance, amount);
        }
        _balances[from] = currentBalance - amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _transferAllIfAny(address from, address to) internal {
        uint256 balanceLeft = _balances[from];
        if (balanceLeft > 0) {
            _balances[from] = 0;
            _balances[to] += balanceLeft;
            emit Transfer(from, to, balanceLeft);
        }
    }

    function _mint(address to, uint256 amount) internal override {
        _totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burnFrom(address from, uint256 amount) internal override {
        uint256 currentBalance = _balances[from];
        if (currentBalance < amount) {
            revert NotEnoughTokens(currentBalance, amount);
        }
        _balances[from] = currentBalance - amount;
        _totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}

// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "solidity-kit/solc_0_8/ERC20/interfaces/IERC20.sol";
import "./interface/IOnStakeChange.sol";
import "./interface/IReward.sol";
import "solidity-proxy/solc_0_8/ERC1967/Proxied.sol";
import "solidity-kit/solc_0_8/utils/UsingGenericErrors.sol";

contract RewardsGenerator is IERC20, IOnStakeChange, Proxied {
    // ---------------------------------------------------------------------------------------------------------------
    // Constants and immutables
    // ---------------------------------------------------------------------------------------------------------------

    string internal constant SYMBOL = "POINT";
    string internal constant NAME = "Points";
    uint256 internal constant PRECISION = 1e24;
    uint256 internal constant DECIMALS_18_MILLIONTH = 1000000000000; // 1 millionth of a token so that it matches with REWARD_RATE_millionth

    uint256 internal immutable REWARD_RATE_millionth;
    uint256 internal immutable FIXED_REWARD_RATE_thousands_millionth;
    IReward internal immutable REWARD;

    // ---------------------------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------------------------

    event GameEnabled(address indexed game, uint256 weight, uint256 timestamp);
    event AccounFixedRewardUpdated(address indexed account, FixedRatePerAccount fixedRateStatus);
    event AccountSharedRewardUpdated(address indexed account, SharedRatePerAccount sharedRateStatus, uint256 timestamp);
    event GlobalRewardUpdated(GlobalState globalStatus);

    // ---------------------------------------------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------------------------------------------

    bool internal _init;

    struct GlobalState {
        uint40 lastUpdateTime;
        uint104 totalRewardPerPointAtLastUpdate; // PRECISION = 1e24
        uint112 totalPoints;
    }
    GlobalState _global;

    struct SharedRatePerAccount {
        uint112 points;
        uint104 totalRewardPerPointAccounted; // PRECISION = 1e24
        // we do not pack here as we want to keep precision
        uint112 rewardsToWithdraw;
    }

    mapping(address => SharedRatePerAccount) _sharedRateRewardPerAccount;

    struct FixedRatePerAccount {
        uint112 toWithdraw;
        uint40 lastTime;
    }
    mapping(address => FixedRatePerAccount) internal _fixedRateRewardPerAccount;

    mapping(address => uint256) internal _games;

    // ---------------------------------------------------------------------------------------------------------------
    // Constructor AND Upgrade
    // ---------------------------------------------------------------------------------------------------------------

    struct Config {
        uint256 rewardRateMillionth;
        uint256 fixedRewardRateThousandsMillionth;
    }

    constructor(IReward rewardAddress, Config memory config, address[] memory initialGames) {
        REWARD = rewardAddress;
        REWARD_RATE_millionth = config.rewardRateMillionth;
        FIXED_REWARD_RATE_thousands_millionth = config.fixedRewardRateThousandsMillionth;

        _postUpgrade(rewardAddress, config, initialGames);
    }

    function postUpgrade(
        IReward rewardAddress,
        Config memory config,
        address[] memory initialGames
    ) external onlyProxyAdmin {
        _postUpgrade(rewardAddress, config, initialGames);
    }

    function _postUpgrade(IReward, Config memory, address[] memory initialGames) internal {
        if (!_init) {
            for (uint256 i = 0; i < initialGames.length; i++) {
                _enableGame(initialGames[i], 1000000000000000000);
            }
            _init = true;
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // External
    // ---------------------------------------------------------------------------------------------------------------

    /// @notice Allow a contract (a game) to add points to the rewards system
    /// @param game the contract that is allowed to call in
    /// @param weight (not implemented, act as boolean for now) (0 disable the game)
    function enableGame(address game, uint256 weight) external onlyProxyAdmin {
        _enableGame(game, weight);
    }

    /// @notice return the weight of the game
    /// @param game the contract to query about
    /// @return weight the weight of the game (not implemented, act as boolean for now)
    function games(address game) external view returns (uint256 weight) {
        weight = _games[game];
    }

    /// @notice return the current global state
    function global() external view returns (GlobalState memory) {
        return _global;
    }

    /// @inheritdoc IOnStakeChange
    function add(address account, uint256 amount) external override onlyGames {
        _add(account, amount);
    }

    /// @inheritdoc IOnStakeChange
    function remove(address account, uint256 amount) external override onlyGames {
        _remove(account, amount);
    }

    /// @inheritdoc IOnStakeChange
    function move(address from, address to, uint256 amount) external override onlyGames {
        _remove(from, amount);
        _add(to, amount);
    }

    /// @inheritdoc IERC20
    function name() public pure returns (string memory) {
        return NAME;
    }

    /// @inheritdoc IERC20
    function symbol() external pure returns (string memory) {
        return SYMBOL;
    }

    /// @inheritdoc IERC20
    function totalSupply() external view override returns (uint256) {
        return _global.totalPoints;
    }

    /// @inheritdoc IERC20
    function balanceOf(address owner) external view override returns (uint256) {
        return _sharedRateRewardPerAccount[owner].points;
    }

    /// @inheritdoc IERC20
    function allowance(address, address) external pure override returns (uint256) {
        return 0;
    }

    /// @inheritdoc IERC20
    function decimals() external pure virtual returns (uint8) {
        return uint8(18);
    }

    /// @inheritdoc IERC20
    function transfer(address, uint256) external pure returns (bool) {
        revert UsingGenericErrors.NonTransferable();
    }

    /// @inheritdoc IERC20
    function approve(address, uint256) external pure returns (bool) {
        revert UsingGenericErrors.NonTransferable();
    }

    /// @inheritdoc IERC20
    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert UsingGenericErrors.NonTransferable();
    }

    /// @notice claim the rewards earned so far in the shared pool
    /// @param to address to send the reward to
    function claimSharedPoolRewards(address to) external {
        if (address(REWARD) == address(0)) {
            revert UsingGenericErrors.NotAuthorized();
        }
        address account = msg.sender;
        uint256 accountPointsSoFar = _sharedRateRewardPerAccount[account].points;

        (, uint256 totalRewardPerPoint) = _updateGlobal();
        uint256 amount = _computeRewardsEarned(
            _sharedRateRewardPerAccount[account].totalRewardPerPointAccounted,
            accountPointsSoFar,
            totalRewardPerPoint,
            _sharedRateRewardPerAccount[account].rewardsToWithdraw
        );
        _sharedRateRewardPerAccount[account].totalRewardPerPointAccounted = uint104(totalRewardPerPoint);

        if (amount > 0) {
            _sharedRateRewardPerAccount[account].rewardsToWithdraw = 0;
            REWARD.reward(to, amount);
        }

        emit AccountSharedRewardUpdated(account, _sharedRateRewardPerAccount[account], block.timestamp);
    }

    /// @notice claim the rewards earned so far using a fixed rate per point
    /// @param to address to send the reward to
    function claimFixedRewards(address to) external {
        if (address(REWARD) == address(0)) {
            revert UsingGenericErrors.NotAuthorized();
        }
        address account = msg.sender;
        uint256 amount = earnedFromFixedRate(account);
        if (amount > 0) {
            _fixedRateRewardPerAccount[account].lastTime = uint40(block.timestamp);
            _fixedRateRewardPerAccount[account].toWithdraw = 0;
            REWARD.reward(to, amount);
        }
        emit AccounFixedRewardUpdated(account, _fixedRateRewardPerAccount[account]);
    }

    /// @notice The amount of reward each point has earned so far
    function getTotalRewardPerPointWithPrecision24() external view returns (uint256) {
        return
            _global.totalRewardPerPointAtLastUpdate +
            _computeExtraTotalRewardPerPointSinceLastTime(
                _global.totalPoints,
                REWARD_RATE_millionth,
                _global.lastUpdateTime
            );
    }

    /// @notice The amount of reward an account has accrued so far. Does not include already withdrawn rewards.
    /// @param account address to query about
    function earnedFromPoolRate(address account) public view returns (uint256) {
        return
            _computeRewardsEarned(
                _sharedRateRewardPerAccount[account].totalRewardPerPointAccounted,
                _sharedRateRewardPerAccount[account].points,
                _global.totalRewardPerPointAtLastUpdate +
                    _computeExtraTotalRewardPerPointSinceLastTime(
                        _global.totalPoints,
                        REWARD_RATE_millionth,
                        _global.lastUpdateTime
                    ),
                _sharedRateRewardPerAccount[account].rewardsToWithdraw
            );
    }

    /// @notice The amount of reward an account has accrued so far. Does not include already withdrawn rewards.
    /// @param account address to query about
    function earnedFromFixedRate(address account) public view returns (uint256) {
        uint256 extraFixed = ((block.timestamp - _fixedRateRewardPerAccount[account].lastTime) *
            _sharedRateRewardPerAccount[account].points *
            FIXED_REWARD_RATE_thousands_millionth) / 1000000000;
        return extraFixed + _fixedRateRewardPerAccount[account].toWithdraw;
    }

    /// @notice The amount of reward an account has accrued so far. Does not include already withdrawn rewards.
    /// @param accounts list of address to query about
    function earnedFromFixedRateMultipleAccounts(
        address[] calldata accounts
    ) external view returns (uint256[] memory result) {
        result = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            result[i] = earnedFromFixedRate(accounts[i]);
        }
    }

    /// @notice The amount of reward an account has accrued so far. Does not include already withdrawn rewards.
    /// @param accounts list of address to query about
    function earnedFromPoolRateMultipleAccounts(
        address[] calldata accounts
    ) external view returns (uint256[] memory result) {
        result = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            result[i] = earnedFromPoolRate(accounts[i]);
        }
    }

    /// @notice update the global pool rate
    function update() external {
        _updateGlobal();
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------------------------

    function _enableGame(address game, uint256 weight) internal {
        _games[game] = weight;
        emit GameEnabled(game, weight, block.timestamp);
    }

    function _add(address account, uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        (uint256 totalPointsSoFar, uint256 accountPointsSoFar) = _update(account);

        unchecked {
            // update total points and the account's point, their reward will be counted on next interaction.
            _global.totalPoints = uint112(totalPointsSoFar + amount);
            _sharedRateRewardPerAccount[account].points = uint112(accountPointsSoFar + amount);
        }
        emit Transfer(address(0), account, amount);
        emit AccountSharedRewardUpdated(account, _sharedRateRewardPerAccount[account], block.timestamp);
        emit AccounFixedRewardUpdated(account, _fixedRateRewardPerAccount[account]);
    }

    function _remove(address account, uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        // update the amount generated, store it in
        (uint256 totalPointsSoFar, uint256 accountPointsSoFar) = _update(account);

        unchecked {
            // update total points and the account's point, their reward will be counted on next interaction.
            _global.totalPoints = uint112(totalPointsSoFar - amount);
            _sharedRateRewardPerAccount[account].points = uint112(accountPointsSoFar - amount);
        }
        emit Transfer(account, address(0), amount);
        emit AccountSharedRewardUpdated(account, _sharedRateRewardPerAccount[account], block.timestamp);
        emit AccounFixedRewardUpdated(account, _fixedRateRewardPerAccount[account]);
    }

    function _computeRewardsEarned(
        uint256 totalRewardPerPointAccountedSoFar,
        uint256 accountPoints,
        uint256 currentTotalRewardPerPoint,
        uint256 accountRewardsSoFar
    ) internal pure returns (uint256) {
        return
            accountRewardsSoFar +
            (((accountPoints * (currentTotalRewardPerPoint - totalRewardPerPointAccountedSoFar)) *
                DECIMALS_18_MILLIONTH) / PRECISION);
    }

    function _computeExtraTotalRewardPerPointSinceLastTime(
        uint256 totalPoints,
        uint256 rewardRateMillionth,
        uint256 lastUpdateTime
    ) internal view returns (uint256) {
        if (totalPoints == 0) {
            return 0;
        }
        return ((block.timestamp - lastUpdateTime) * rewardRateMillionth * PRECISION) / totalPoints;
    }

    function _updateGlobal() internal returns (uint256 totalPointsSoFar, uint256 totalRewardPerPointAllocatedSoFar) {
        totalPointsSoFar = _global.totalPoints;

        uint256 extraTotalRewardPerPoint = _computeExtraTotalRewardPerPointSinceLastTime(
            totalPointsSoFar,
            REWARD_RATE_millionth,
            _global.lastUpdateTime
        );

        totalRewardPerPointAllocatedSoFar = _global.totalRewardPerPointAtLastUpdate + extraTotalRewardPerPoint;

        _global.totalRewardPerPointAtLastUpdate = uint104(totalRewardPerPointAllocatedSoFar);
        _global.lastUpdateTime = uint40(block.timestamp);

        emit GlobalRewardUpdated(_global);
    }

    function _updateAccount(
        address account,
        uint256 totalRewardPerPointAllocatedSoFar
    ) internal returns (uint256 accountPointsSoFar) {
        accountPointsSoFar = _sharedRateRewardPerAccount[account].points;

        // update the reward that can be withdrawn, catching up account state to global
        _sharedRateRewardPerAccount[account].rewardsToWithdraw = uint112(
            _computeRewardsEarned(
                // last checkpoint : when was the account last updated
                _sharedRateRewardPerAccount[account].totalRewardPerPointAccounted,
                accountPointsSoFar,
                totalRewardPerPointAllocatedSoFar,
                // rewards already registered
                _sharedRateRewardPerAccount[account].rewardsToWithdraw
            )
        );
        _sharedRateRewardPerAccount[account].totalRewardPerPointAccounted = uint104(totalRewardPerPointAllocatedSoFar);

        uint256 extraFixed = ((block.timestamp - _fixedRateRewardPerAccount[account].lastTime) *
            accountPointsSoFar *
            FIXED_REWARD_RATE_thousands_millionth) / 1000000000;
        _fixedRateRewardPerAccount[account].lastTime = uint40(block.timestamp);
        _fixedRateRewardPerAccount[account].toWithdraw += uint112(extraFixed);
    }

    function _update(address account) internal returns (uint256, uint256) {
        (uint256 totalPointsSoFar, uint256 totalRewardPerPointAllocatedSoFar) = _updateGlobal();
        uint256 accountPointsSoFar = _updateAccount(account, totalRewardPerPointAllocatedSoFar);
        return (totalPointsSoFar, accountPointsSoFar);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------------------------------------------------

    modifier onlyGames() {
        if (_games[msg.sender] == 0) {
            revert UsingGenericErrors.NotAuthorized();
        }
        _;
    }
}

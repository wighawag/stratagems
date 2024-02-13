// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./IGemsGenerator.sol";
import "../token/Gems.sol";

contract GemsGenerator is IGemsGenerator {
    uint256 internal constant PRECISION = 1e24;

    event PointsAdded(address indexed account, uint256 amount);
    event PointsRemoved(address indexed account, uint256 amount);
    event GemsGiven(address indexed account, uint256 reward);

    struct Config {
        uint64 maxRate;
        // 0 and the curve is linear, means rate moves with the points and players win the same ratio at all time
        // > 0 , means rate start higher giving more to early players
        uint64 minRate;
        uint64 surplusRewardRatio;
    }

    uint256 internal _lastUpdateTime;
    uint256 internal _totalRewardPerPointAtLastUpdate;
    uint256 internal _totalPoints;

    uint256 internal _extraGemsGenerated;
    uint256 internal _totalSurplusRewardGenerated;

    mapping(address => uint256) internal _pointsPerAccount;
    mapping(address => uint256) internal _totalRewardPerPointAccountedPerAccount;
    mapping(address => uint256) internal _rewardsToWithdrawPerAccount;

    mapping(address => uint256) internal _games;

    Gems internal immutable GEMS;
    uint256 internal immutable ORIGINAL_TOTAL_SUPPLY;

    Config public _config;

    constructor(Gems gems) {
        GEMS = gems;
        ORIGINAL_TOTAL_SUPPLY = gems.totalSupply();

        // -----------------------------------------------------------------------------------------------------------
        // CONFIG
        // -----------------------------------------------------------------------------------------------------------
        _config.minRate = 0; // TODO configure 10000th
        _config.maxRate = 2000; // TODO configure 10000th
        _config.surplusRewardRatio = 5000; // TODO configure 10000th
        // -----------------------------------------------------------------------------------------------------------
    }

    /// @inheritdoc IGemsGenerator
    function addPoints(uint256 amount, address account) external override onlyGames {
        if (amount == 0) {
            return;
        }

        (uint256 totalPointsSoFar, uint256 accountPointsSoFar) = _update(account);

        // update total points and the account's point, their reward will be counted on next interaction.
        _totalPoints = totalPointsSoFar + amount; // WRITE + 1 // TODO remove that line because _gems.balanceOf(address(this)) should be equivalent
        _pointsPerAccount[account] = accountPointsSoFar + amount; // WRITE + 1

        emit PointsAdded(account, amount);
    }

    /// @inheritdoc IGemsGenerator
    function removePoints(uint256 amount, address account) external override onlyGames {
        if (amount == 0) {
            return;
        }

        // update the amount generated, store it in
        (uint256 totalPointsSoFar, uint256 accountPointsSoFar) = _update(account);

        unchecked {
            _pointsPerAccount[account] = accountPointsSoFar - amount;
            _totalPoints = totalPointsSoFar - amount;
        }
        emit PointsRemoved(account, amount);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // For Accounts
    // ---------------------------------------------------------------------------------------------------------------

    /// @notice Withdraws all earned rewards
    function withdrawGems() external {
        uint256 accountPointsSoFar = _pointsPerAccount[msg.sender];

        (uint256 totalPointsSoFar, uint256 totalRewardPerPoint, ) = _updateGlobal();
        uint256 reward = _computeGemsEarned(
            _totalRewardPerPointAccountedPerAccount[msg.sender],
            accountPointsSoFar,
            totalRewardPerPoint,
            _rewardsToWithdrawPerAccount[msg.sender]
        );
        _totalRewardPerPointAccountedPerAccount[msg.sender] = totalRewardPerPoint;

        if (reward > 0) {
            _rewardsToWithdrawPerAccount[msg.sender] = 0;
            // TODO mint ?
            // or do we have a global trigger first in _updateGlobal
            // or maybe in the transfer function we auto mint based on from ?
            GEMS.transfer(msg.sender, reward);
            emit GemsGiven(msg.sender, reward);
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Getters
    // ---------------------------------------------------------------------------------------------------------------

    // TODO balanceOf
    // TODO totalSupply
    // ... ?

    /// @notice The amount of reward gems each point has earned so far
    function getTotalRewardPerPoint() external view returns (uint256) {
        uint256 totalPointsSoFar = _totalPoints;
        uint256 extraGemsGenerated = _extraGemsGenerated;
        uint256 totalSupplySoFar = ORIGINAL_TOTAL_SUPPLY + extraGemsGenerated;
        // TODO add in extraGemsGenerated based on previous rewardRate ?
        uint256 rewardRate = _computeRewardRate(totalPointsSoFar, totalSupplySoFar, _config.minRate, _config.maxRate);
        return
            _totalRewardPerPointAtLastUpdate +
            _computeExtraTotalRewardPerPointSinceLastTime(totalPointsSoFar, rewardRate, _lastUpdateTime);
    }

    /// @notice The amount of reward gems an account has accrued so far. Does not include already withdrawn rewards.
    function earned(address account) external view returns (uint256) {
        uint256 totalPointsSoFar = _totalPoints;
        uint256 extraGemsGenerated = _extraGemsGenerated;
        uint256 totalSupplySoFar = ORIGINAL_TOTAL_SUPPLY + extraGemsGenerated;
        // TODO add in extraGemsGenerated based on previous rewardRate ?
        uint256 rewardRate = _computeRewardRate(totalPointsSoFar, totalSupplySoFar, _config.minRate, _config.maxRate);
        return
            _computeGemsEarned(
                _totalRewardPerPointAccountedPerAccount[account],
                _pointsPerAccount[account],
                _totalRewardPerPointAtLastUpdate +
                    _computeExtraTotalRewardPerPointSinceLastTime(totalPointsSoFar, rewardRate, _lastUpdateTime),
                _rewardsToWithdrawPerAccount[account]
            );
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------------------------

    function _computeRewardRate(
        uint256 totalPointsSoFar,
        uint256 totalSupplySoFar,
        uint256 minRate,
        uint256 maxRate
    ) internal pure returns (uint256 rewardRate) {
        // NOTE: points are assumed to be the same value range as the reward gems
        //  the equation "totalPointsSoFar / totalSupplySoFar" relies on it
        //
        // NOTE: This also assumes this contract is the only generator of gems
        // TODO separate role and have a central place to reserve gems in the Gems contract
        // claiming reward fro reserve will reduce the reserve while increasing the gems minted, keeping total supply adjusted
        uint256 targetRate = (maxRate - minRate) * (totalPointsSoFar / totalSupplySoFar) + minRate;
        rewardRate = (targetRate * totalSupplySoFar) / 315360000000; // number of seconds in a year multiple by 10,000
    }

    function _computeGemsEarned(
        uint256 totalRewardPerPointAccountedSoFar,
        uint256 accountPoints,
        uint256 currentTotalRewardPerPoint,
        uint256 accountRewardsSoFar
    ) internal pure returns (uint256) {
        return
            accountRewardsSoFar +
            ((accountPoints * (currentTotalRewardPerPoint - totalRewardPerPointAccountedSoFar)) / PRECISION);
    }

    // TODO make it pure and totalPoints == 0 check outside ?
    function _computeExtraTotalRewardPerPointSinceLastTime(
        uint256 totalPoints,
        uint256 rewardRate,
        uint256 lastUpdateTime
    ) internal view returns (uint256) {
        if (totalPoints == 0) {
            return 0;
        }
        return ((block.timestamp - lastUpdateTime) * rewardRate * PRECISION) / totalPoints;
    }

    function _updateGlobal()
        internal
        returns (uint256 totalPointsSoFar, uint256 totalRewardPerPointAllocatedSoFar, uint256 rewardRate)
    {
        totalPointsSoFar = _totalPoints; // READ + 1
        uint256 extraGemsGenerated = _extraGemsGenerated; // READ + 1
        uint256 totalSupplySoFar = ORIGINAL_TOTAL_SUPPLY + extraGemsGenerated; // READ + 1

        // reward rate for players based on past data, do not consider the compounding effect that should reduce its rate
        // TODO apply it twice? see below
        rewardRate = _computeRewardRate(totalPointsSoFar, totalSupplySoFar, _config.minRate, _config.maxRate); // READ config

        // recompute rewardRate based on aproximate computation of extraTotalRewardPerPoint
        // uint256 extraTotalRewardPerPoint = _computeExtraTotalRewardPerPointSinceLastTime(totalPointsSoFar, rewardRate, _lastUpdateTime);
        // rewardRate = _computeRewardRate(totalPointsSoFar + extraTotalRewardPerPoint * totalPointsSoFar, totalSupplySoFar);

        uint256 extraTotalRewardPerPoint = _computeExtraTotalRewardPerPointSinceLastTime(
            totalPointsSoFar,
            rewardRate,
            _lastUpdateTime
        ); // READ + 1

        // surplus reward
        uint256 surplusRewardPerPoint = _computeExtraTotalRewardPerPointSinceLastTime(
            totalPointsSoFar,
            (rewardRate * _config.surplusRewardRatio) / 10000,
            _lastUpdateTime
        ); // READ + 1 // READ config?
        uint256 surplusRewardGenerated = surplusRewardPerPoint * totalPointsSoFar;
        _totalSurplusRewardGenerated = _totalSurplusRewardGenerated + surplusRewardGenerated; // WRITE + 1

        totalRewardPerPointAllocatedSoFar = _totalRewardPerPointAtLastUpdate + extraTotalRewardPerPoint; // READ + 1 // need for returns params

        _extraGemsGenerated =
            extraGemsGenerated +
            (extraTotalRewardPerPoint * totalPointsSoFar) +
            surplusRewardGenerated; // WRITE + 1 // TODO use mint ? => _gems.totalSupply

        // TODO group these 2 in a struct
        _totalRewardPerPointAtLastUpdate = totalRewardPerPointAllocatedSoFar; // WRITE + 1
        _lastUpdateTime = block.timestamp; // WRITE + 1
    }

    function _updateAccount(
        address account,
        uint256 totalRewardPerPointAllocatedSoFar
    ) internal returns (uint256 accountPointsSoFar) {
        accountPointsSoFar = _pointsPerAccount[account]; // READ: +1 (the account's points so far)

        _rewardsToWithdrawPerAccount[account] = _computeGemsEarned( // WRITE: +1 (update the reward that can be withdrawn, catching up account state to global)
            _totalRewardPerPointAccountedPerAccount[account], // READ: +1 (last checkpoint : when was the account last updated)
            accountPointsSoFar,
            totalRewardPerPointAllocatedSoFar,
            _rewardsToWithdrawPerAccount[account] // READ: +1 (rewards already registered)
        );
        _totalRewardPerPointAccountedPerAccount[account] = totalRewardPerPointAllocatedSoFar; // WRITE: +1
    }

    function _update(address account) internal returns (uint256, uint256) {
        (uint256 totalPointsSoFar, uint256 totalRewardPerPointAllocatedSoFar, ) = _updateGlobal();
        uint256 accountPointsSoFar = _updateAccount(account, totalRewardPerPointAllocatedSoFar);
        return (totalPointsSoFar, accountPointsSoFar);
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------------------------------------------------

    modifier onlyGames() {
        require(_games[msg.sender] > 0, "NOT_AUTHORIZED_GAME");
        _;
    }
}

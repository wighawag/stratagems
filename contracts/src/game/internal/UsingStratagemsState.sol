// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "./UsingStratagemsStore.sol";
import "../interface/UsingStratagemsEvents.sol";
import "../interface/UsingStratagemsErrors.sol";
import "../../utils/PositionUtils.sol";
import {UsingCommitReveal} from "../../commit-reveal/UsingCommitReveal.sol";
import {CommitReveal} from "../../commit-reveal/CommitReveal.sol";

/// @dev Stratagems on the commit-reveal base. The base holds the reserve, the
///      bonded commitment and its chain of chunks, the cycle and both
///      settlements of a missed reveal; this holds the board and the rules.
abstract contract UsingStratagemsState is
    UsingStratagemsStore,
    UsingStratagemsEvents,
    UsingStratagemsErrors,
    UsingCommitReveal
{
    /// @notice the token a gem is made of: the reserve, the stakes and the payouts
    IERC20 internal immutable TOKENS;
    uint8 internal immutable MAX_LIFE;
    uint256 internal immutable NUM_TOKENS_PER_GEMS;
    /// @notice where a forfeited bond goes
    address payable internal immutable BURN_ADDRESS;
    IOnStakeChange internal immutable GENERATOR;

    address internal constant EVIL_OWNER = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;

    constructor(
        Config memory config
    )
        UsingCommitReveal(
            CommitRevealConfig({
                startTime: config.startTime,
                commitPhaseDuration: config.commitPhaseDuration,
                revealPhaseDuration: config.revealPhaseDuration,
                time: config.time,
                actionsPerReveal: config.actionsPerReveal,
                cyclePolicy: config.cyclePolicy
            })
        )
    {
        TOKENS = config.tokens;
        BURN_ADDRESS = config.burnAddress;
        MAX_LIFE = config.maxLife;
        NUM_TOKENS_PER_GEMS = config.numTokensPerGems;
        GENERATOR = config.generator;
    }

    /// @notice The current cycle, in the 24 bits a cell stores it in.
    /// @dev Cycles start at 2, as alpha1's epochs did. 24 bits of 24-hour
    ///      cycles is about 45,000 years; refused rather than wrapped.
    function _currentCycle() internal view returns (uint24 cycle, bool commiting) {
        (uint64 cycleNumber, bool isCommiting) = _cycleNumber();
        if (cycleNumber > type(uint24).max) {
            revert CycleTooFar(cycleNumber);
        }
        return (uint24(cycleNumber), isCommiting);
    }

    /// @notice What not revealing costs: tokens out of the reserve, burnt.
    /// @dev The base's default debits the reserve and keeps the tokens in the
    ///      contract; stratagems burns them, as alpha1 did, so nobody (the
    ///      settler least of all) receives any of it.
    function _forfeit(uint256 player, uint256 amount) internal virtual override returns (uint256 forfeited) {
        forfeited = CommitReveal.debit(player, amount);
        if (forfeited != 0) {
            TOKENS.transfer(BURN_ADDRESS, forfeited);
        }
    }

    function _computeNewLife(
        uint24 lastUpdate,
        uint8 enemyMap,
        int8 delta,
        uint8 life,
        uint24 cycle
    ) internal view returns (uint8 newLife, uint24 cycleUsed) {
        cycleUsed = lastUpdate;
        if (lastUpdate >= 1 && life > 0) {
            uint256 cycleDelta = cycle - lastUpdate;
            if (cycleDelta > 0) {
                int8 effectiveDelta = _effectiveDelta(delta, enemyMap);
                if (effectiveDelta > 0) {
                    uint8 maxCycle = ((MAX_LIFE - life) + uint8(effectiveDelta) - 1) / uint8(effectiveDelta);
                    if (cycleDelta > maxCycle) {
                        cycleDelta = maxCycle;
                    }

                    life += uint8(cycleDelta) * uint8(effectiveDelta);
                    if (life > MAX_LIFE) {
                        life = MAX_LIFE;
                    }
                    newLife = life;

                    cycleUsed = cycle;
                } else if (effectiveDelta < 0) {
                    uint8 numCycleBeforeDying = (life + uint8(-effectiveDelta) - 1) / uint8(-effectiveDelta);
                    if (cycleDelta > numCycleBeforeDying) {
                        cycleDelta = numCycleBeforeDying;
                    }
                    uint8 lifeLoss = uint8(cycleDelta) * uint8(-effectiveDelta);
                    if (lifeLoss > life) {
                        newLife = 0;
                    } else {
                        newLife = life - lifeLoss;
                    }

                    cycleUsed = lastUpdate + uint24(cycleDelta);
                } else {
                    newLife = life;

                    cycleUsed = cycle;
                }
            } else {
                newLife = life;

                cycleUsed = lastUpdate;
            }
        }
    }

    function _effectiveDelta(int8 delta, uint8 enemyMap) internal pure returns (int8 effectiveDelta) {
        effectiveDelta = delta > 0 ? int8(1) : -1;
        if (effectiveDelta < 0 && enemyMap == 0) {
            effectiveDelta = int8(1);
        }
    }

    function _getUpdatedCell(
        uint64 position,
        uint24 cycle
    ) internal view returns (Cell memory updatedCell, bool justDied) {
        updatedCell = _cells[position];
        uint24 lastUpdate = updatedCell.lastCycleUpdate;
        int8 delta = updatedCell.delta;
        uint8 life = updatedCell.life;
        if (lastUpdate >= 1 && life > 0) {
            (uint8 newLife, ) = _computeNewLife(lastUpdate, updatedCell.enemyMap, delta, life, cycle);
            updatedCell.life = newLife;
            updatedCell.lastCycleUpdate = cycle;
            justDied = newLife == 0;
            // PRODUCING TIME ACCRUES WHERE lastCycleUpdate MOVES, and only there, so
            // no span is counted twice. alpha1 accrued it here for every cell, dead
            // ones included, without moving a dead cell's lastCycleUpdate: a poke
            // stored the span and a neighbour's update in the same cycle counted it
            // again, so the total depended on which came first (and an empty or
            // removed cell, whose lastCycleUpdate is zero, accrued the whole cycle
            // number). A dead cell accrues through `_setCell`, which moves it.
            int8 effectiveDelta = _effectiveDelta(updatedCell.delta, updatedCell.enemyMap);
            if (effectiveDelta > 0) {
                updatedCell.producingCycles += cycle - lastUpdate;
            }
        }
    }

    function _ownerOf(uint256 tokenID) internal view virtual returns (address owner) {
        owner = address(uint160(_owners[tokenID]));
    }

    /// @notice Who owned the cell before any reveal of `cycle` moved on it.
    /// @dev Owners change only through a move on the cell (transfers are not
    ///      implemented), and the first move of a cycle records the owner
    ///      before it, so this is the owner every payout of the cycle goes to,
    ///      whatever order the reveals arrive in.
    function _ownerAtCycleStart(uint256 position, uint24 cycle) internal view returns (address) {
        CellAtCycleStart memory start = _cellsAtCycleStart[position];
        if (start.cycle == cycle) {
            return start.owner;
        }
        return _ownerOf(position);
    }
}

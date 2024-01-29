// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./UsingStratagemsStore.sol";
import "../interface/UsingStratagemsEvents.sol";
import "../interface/UsingStratagemsErrors.sol";
import "./UsingVirtualTime.sol";
import "../../utils/PositionUtils.sol";

// TODO use hardhat-preprocessor
import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

library logger {
    using PositionUtils for uint64;

    address constant CONSOLE_ADDRESS = 0x000000000000000000636F6e736F6c652e6c6f67;

    function _sendLogPayload(bytes memory payload) private view {
        address consoleAddress = CONSOLE_ADDRESS;
        /// @solidity memory-safe-assembly
        assembly {
            pop(staticcall(gas(), consoleAddress, add(payload, 32), mload(payload), 0, 0))
        }
    }

    // _sendLogPayload(abi.encodeWithSignature('log(string,int256,int256)', 'cell %s', x, y));

    function logPosition(string memory title, uint64 pos) internal view {
        (int32 x, int32 y) = pos.toXY();
        console.log("%s: (%s,%s)", title, Strings.toString(x), Strings.toString(y));
    }

    function logCell(
        uint8 ii,
        string memory title,
        uint64 id,
        UsingStratagemsTypes.Cell memory cell,
        address owner
    ) internal view {
        string memory indent = ii == 0
            ? ""
            : ii == 1
                ? "    "
                : ii == 2
                    ? "        "
                    : "            ";
        // string memory indent = '';
        console.log("%s%s", indent, title);
        (int32 x, int32 y) = id.toXY();
        console.log("%s-------------------------------------------------------------", indent);
        console.log("%scell (%s,%s)", indent, Strings.toString(x), Strings.toString(y));
        console.log("%s-------------------------------------------------------------", indent);
        console.log("%s - lastEpochUpdate:  %s", indent, cell.lastEpochUpdate);
        console.log("%s - epochWhenTokenIsAdded:  %s", indent, cell.epochWhenTokenIsAdded);
        console.log("%s - color:  %s", indent, uint8(cell.color));
        console.log("%s - life:  %s", indent, cell.life);
        console.log("%s - distribution:  %s", indent, cell.distribution);
        console.log("%s - owner:  %s", indent, owner);
        console.log("%s - delta: %s", indent, Strings.toString(cell.delta));
        console.log("%s - enemyMap:  %s", indent, cell.enemyMap);
        console.log("%s-------------------------------------------------------------", indent);
    }

    function logTransfers(
        uint8 ii,
        string memory title,
        UsingStratagemsTypes.TokenTransferCollection memory transferCollection
    ) internal pure {
        string memory indent = ii == 0
            ? ""
            : ii == 1
                ? "    "
                : ii == 2
                    ? "        "
                    : "            ";
        // string memory indent = '';
        console.log("%s%s", indent, title);
        console.log("%s-------------------------------------------------------------", indent);
        for (uint256 i = 0; i < transferCollection.numTransfers; i++) {
            console.log(
                "%stransfer (%s,%s)",
                indent,
                transferCollection.transfers[i].to,
                Strings.toString(transferCollection.transfers[i].amount)
            );
        }
        console.log("%s-------------------------------------------------------------", indent);
    }
}

abstract contract UsingStratagemsState is
    UsingStratagemsStore,
    UsingStratagemsEvents,
    UsingStratagemsErrors,
    UsingVirtualTime
{
    /// @notice The token used for the game. Each gems on the board contains that token
    IERC20WithIERC2612 internal immutable TOKENS;
    /// @notice the timestamp (in seconds) at which the game start, it start in the commit phase
    uint256 internal immutable START_TIME;
    /// @notice the duration of the commit phase in seconds
    uint256 internal immutable COMMIT_PHASE_DURATION;
    /// @notice the duration of the reveal phase in seconds
    uint256 internal immutable REVEAL_PHASE_DURATION;
    /// @notice the max number of level a cell can reach in the game
    uint8 internal immutable MAX_LIFE;
    /// @notice the number of tokens underlying each gems on the board.
    uint256 internal immutable NUM_TOKENS_PER_GEMS;
    /// @notice the address to send the token to when burning
    address payable internal immutable BURN_ADDRESS;

    /// @notice the number of moves a hash represent, after that players make use of furtherMoves
    uint8 internal constant MAX_NUM_MOVES_PER_HASH = 32;

    /// @notice Create an instance of a Stratagems game
    /// @param config configuration options for the game
    constructor(Config memory config) UsingVirtualTime(config) {
        TOKENS = config.tokens;
        BURN_ADDRESS = config.burnAddress;
        START_TIME = config.startTime;
        COMMIT_PHASE_DURATION = config.commitPhaseDuration;
        REVEAL_PHASE_DURATION = config.revealPhaseDuration;
        MAX_LIFE = config.maxLife;
        NUM_TOKENS_PER_GEMS = config.numTokensPerGems;
    }

    function _epoch() internal view virtual returns (uint24 epoch, bool commiting) {
        uint256 epochDuration = COMMIT_PHASE_DURATION + REVEAL_PHASE_DURATION;
        uint256 time = _timestamp();
        if (time < START_TIME) {
            revert GameNotStarted();
        }
        uint256 timePassed = time - START_TIME;
        epoch = uint24(timePassed / epochDuration + 2); // epoch start at 2, this make the hypothetical previous reveal phase's epoch to be 1
        commiting = timePassed - ((epoch - 2) * epochDuration) < COMMIT_PHASE_DURATION;
    }

    function _computeNewLife(
        uint24 lastUpdate,
        uint8 enemyMap,
        int8 delta,
        uint8 life,
        uint24 epoch
    ) internal view returns (uint8 newLife, uint24 epochUsed) {
        epochUsed = lastUpdate;
        if (lastUpdate >= 1 && life > 0) {
            uint256 epochDelta = epoch - lastUpdate;
            if (epochDelta > 0) {
                int8 effectiveDelta = delta != 0 ? delta : -1;
                if (effectiveDelta < 0 && enemyMap == 0) {
                    effectiveDelta = 0;
                }
                if (effectiveDelta > 0) {
                    // if (life < MAX_LIFE) {
                    uint8 maxEpoch = ((MAX_LIFE - life) + uint8(effectiveDelta) - 1) / uint8(effectiveDelta);
                    if (epochDelta > maxEpoch) {
                        epochDelta = maxEpoch;
                    }

                    life += uint8(epochDelta) * uint8(effectiveDelta);
                    if (life > MAX_LIFE) {
                        life = MAX_LIFE;
                    }
                    newLife = life;
                    epochUsed = epoch;
                    // } else {
                    // 	newLife = life;
                    // 	epochUsed = lastUpdate;
                    // }
                } else if (effectiveDelta < 0) {
                    uint8 numEpochBeforeDying = (life + uint8(-effectiveDelta) - 1) / uint8(-effectiveDelta);
                    if (epochDelta > numEpochBeforeDying) {
                        epochDelta = numEpochBeforeDying;
                    }
                    uint8 lifeLoss = uint8(epochDelta) * uint8(-effectiveDelta);
                    if (lifeLoss > life) {
                        newLife = 0;
                    } else {
                        newLife = life - lifeLoss;
                    }
                    epochUsed = lastUpdate + uint24(epochDelta);
                } else {
                    newLife = life;
                    epochUsed = epoch;
                }
            } else {
                newLife = life;
                epochUsed = lastUpdate;
            }
        }
    }

    function _getUpdatedCell(uint64 position, uint24 epoch) internal view returns (Cell memory updatedCell) {
        // load from state
        updatedCell = _cells[position];
        uint24 lastUpdate = updatedCell.lastEpochUpdate;
        int8 delta = updatedCell.delta;
        uint8 life = updatedCell.life;
        // logger.logCell(0, 'before update', position, updatedCell, address(uint160(_owners[position])));
        if (lastUpdate >= 1 && life > 0) {
            (uint8 newLife, uint24 epochUsed) = _computeNewLife(lastUpdate, updatedCell.enemyMap, delta, life, epoch);
            updatedCell.life = newLife;
            updatedCell.lastEpochUpdate = epochUsed; // TODO check if this is useful to cap it to epoch where it died
        }
    }

    /// @dev Get the owner of a token.
    /// @param tokenID The token to query.
    function _ownerOf(uint256 tokenID) internal view virtual returns (address owner) {
        owner = address(uint160(_owners[tokenID]));
    }
}

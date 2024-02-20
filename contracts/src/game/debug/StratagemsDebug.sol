// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../internal/UsingStratagemsSetters.sol";
import "./IStratagemsWithDebug.sol";
import "../../utils/PositionUtils.sol";

contract StratagemsDebug is UsingStratagemsSetters, IStratagemsDebug {
    using PositionUtils for uint64;

    constructor(Config memory config) UsingStratagemsSetters(config) {}

    function getRawCell(uint256 id) external view returns (Cell memory) {
        return _cells[id];
    }

    function _getOwner() internal view returns (address ownerAddress) {
        // solhint-disable-next-line security/no-inline-assembly
        assembly {
            ownerAddress := sload(0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103)
        }
    }

    function forceMoves(address player, Move[] memory moves) external {
        if (msg.sender != _getOwner()) {
            revert NotAuthorized();
        }
        (uint24 epoch, bool commiting) = _epoch();
        if (commiting) {
            epoch--;
        }

        uint256 numTokens = NUM_TOKENS_PER_GEMS * moves.length;
        TOKENS.transferFrom(msg.sender, address(this), numTokens);
        _tokensInReserve[player] += numTokens;
        _resolveMoves(player, epoch, moves, msg.sender);
    }

    function forceCells(DebugCell[] memory cells) external {
        if (msg.sender != _getOwner()) {
            revert NotAuthorized();
        }
        for (uint256 i = 0; i < cells.length; i++) {
            DebugCell memory debugCell = cells[i];
            Cell memory cell = Cell({
                lastEpochUpdate: debugCell.lastEpochUpdate,
                epochWhenTokenIsAdded: debugCell.epochWhenTokenIsAdded,
                color: debugCell.color,
                life: debugCell.life,
                delta: debugCell.delta,
                enemyMap: debugCell.enemyMap,
                distribution: 0, // TODO let debug distribution ?
                stake: 1
            });
            if (_effectiveDelta(cell.delta, cell.enemyMap) > 0) {
                GENERATOR.add(debugCell.owner, NUM_TOKENS_PER_GEMS);
            }

            _cells[debugCell.position] = cell;
            _owners[debugCell.position] = uint256(uint160(debugCell.owner));
        }
        emit ForceCells(cells);
    }

    function forceSimpleCells(SimpleCell[] memory cells) external {
        if (msg.sender != _getOwner()) {
            revert NotAuthorized();
        }
        (uint24 epoch, ) = _epoch();

        for (uint256 i = 0; i < cells.length; i++) {
            SimpleCell memory simpleCell = cells[i];
            if (_cells[simpleCell.position].lastEpochUpdate != 0) {
                revert InvalidCellOverwrite();
            }
            TOKENS.transferFrom(msg.sender, address(this), NUM_TOKENS_PER_GEMS);

            (int8 delta, uint8 enemyMap) = _updateNeighbosrDelta(simpleCell.position, simpleCell.color, epoch);

            Cell memory cell = Cell({
                lastEpochUpdate: epoch,
                epochWhenTokenIsAdded: epoch,
                color: simpleCell.color,
                life: simpleCell.life,
                delta: delta,
                enemyMap: enemyMap,
                distribution: 0,
                stake: 1
            });
            _cells[simpleCell.position] = cell;
            if (_effectiveDelta(cell.delta, cell.enemyMap) > 0) {
                GENERATOR.add(simpleCell.owner, NUM_TOKENS_PER_GEMS);
            }
            _owners[simpleCell.position] = uint256(uint160(simpleCell.owner));
        }

        for (uint256 i = 0; i < cells.length; i++) {
            uint256 position = cells[i].position;
            Cell memory cell = _cells[position];

            // we act as if the token were added in previous epochs
            // this is so it does not affect the reveal phase
            int8 effectiveDelta = _effectiveDelta(cell.delta, cell.enemyMap);
            int256 potentialLife = int256(uint256(cell.life)) - effectiveDelta;
            if (potentialLife < 0) {
                // potentialLife = 0;
                revert ImpossibleConfiguration();
            }
            if (uint256(potentialLife) > MAX_LIFE) {
                unchecked {
                    int32 x = int32(int256(uint256(position) & 0xFFFFFFFF));
                    int32 y = int32(int256(uint256(position) >> 32));
                    revert InvalidLifeConfiguration(uint256(potentialLife), x, y);
                }
            }
            cell.life = uint8(uint256(potentialLife));

            Cell memory updatedCell = Cell({
                lastEpochUpdate: epoch - 1,
                epochWhenTokenIsAdded: epoch - 1,
                color: cell.color,
                life: cell.life,
                delta: cell.delta,
                enemyMap: cell.enemyMap,
                distribution: 0, // TODO let debug distribution ?
                stake: 1
            });

            _cells[position] = updatedCell;

            if (_effectiveDelta(updatedCell.delta, updatedCell.enemyMap) > 0) {
                GENERATOR.add(address(uint160(_owners[position])), NUM_TOKENS_PER_GEMS);
            }

            // logger.logCell(0, string.concat("forceSimpleCells at epoch ", Strings.toString(epoch)), uint64(position), updatedCell, address(uint160(_owners[position])));
        }

        emit ForceSimpleCells(epoch, cells);
    }

    function isEnemyOrFriend(Color a, Color b) internal pure returns (int8) {
        if (a != Color.None && b != Color.None) {
            return a == b ? int8(1) : int8(-1);
        }
        return 0;
    }

    // function _computeDelta(uint64 position, Color color) internal view returns (int8 delta, uint8 enemyMap) {
    // 	unchecked {
    // 		{
    // 			uint64 upPosition = position.offset(0, -1);
    // 			int8 enemyOrFriend = isEnemyOrFriend(color, _cells[upPosition].color);
    // 			if (enemyOrFriend < 0) {
    // 				enemyMap = enemyMap | 1;
    // 			}
    // 			delta += enemyOrFriend;
    // 		}
    // 		{
    // 			uint64 leftPosition = position.offset(-1, 0);
    // 			int8 enemyOrFriend = isEnemyOrFriend(color, _cells[leftPosition].color);
    // 			if (enemyOrFriend < 0) {
    // 				enemyMap = enemyMap | 1;
    // 			}
    // 			delta += enemyOrFriend;
    // 		}

    // 		{
    // 			uint64 downPosition = position.offset(0, 1);
    // 			int8 enemyOrFriend = isEnemyOrFriend(color, _cells[downPosition].color);
    // 			if (enemyOrFriend < 0) {
    // 				enemyMap = enemyMap | 1;
    // 			}
    // 			delta += enemyOrFriend;
    // 		}
    // 		{
    // 			uint64 rightPosition = position.offset(1, 0);
    // 			int8 enemyOrFriend = isEnemyOrFriend(color, _cells[rightPosition].color);
    // 			if (enemyOrFriend < 0) {
    // 				enemyMap = enemyMap | 1;
    // 			}
    // 			delta += enemyOrFriend;
    // 		}
    // 	}
    // }

    function _updateNeighbosrDelta(
        uint64 center,
        Color color,
        uint24 epoch
    ) internal returns (int8 delta, uint8 enemyMap) {
        unchecked {
            {
                uint64 upPosition = center.offset(0, -1);
                Cell memory cell = _cells[upPosition];
                if (cell.color != Color.None) {
                    int8 enemyOrFriend = isEnemyOrFriend(color, cell.color);
                    if (enemyOrFriend < 0) {
                        enemyMap = enemyMap | 1;
                    }
                    delta += enemyOrFriend;
                    _updateCellFromNeighbor(upPosition, cell, cell.life, epoch, 2, Color.None, color);
                }
            }
            {
                uint64 leftPosition = center.offset(-1, 0);
                Cell memory cell = _cells[leftPosition];
                if (cell.color != Color.None) {
                    int8 enemyOrFriend = isEnemyOrFriend(color, cell.color);
                    if (enemyOrFriend < 0) {
                        enemyMap = enemyMap | 2;
                    }
                    delta += enemyOrFriend;
                    _updateCellFromNeighbor(leftPosition, cell, cell.life, epoch, 3, Color.None, color);
                }
            }

            {
                uint64 downPosition = center.offset(0, 1);
                Cell memory cell = _cells[downPosition];
                if (cell.color != Color.None) {
                    int8 enemyOrFriend = isEnemyOrFriend(color, cell.color);
                    if (enemyOrFriend < 0) {
                        enemyMap = enemyMap | 4;
                    }
                    delta += enemyOrFriend;
                    _updateCellFromNeighbor(downPosition, cell, cell.life, epoch, 0, Color.None, color);
                }
            }
            {
                uint64 rightPosition = center.offset(1, 0);
                Cell memory cell = _cells[rightPosition];
                if (cell.color != Color.None) {
                    int8 enemyOrFriend = isEnemyOrFriend(color, cell.color);
                    if (enemyOrFriend < 0) {
                        enemyMap = enemyMap | 8;
                    }
                    delta += enemyOrFriend;
                    _updateCellFromNeighbor(rightPosition, cell, cell.life, epoch, 1, Color.None, color);
                }
            }
        }
    }
}

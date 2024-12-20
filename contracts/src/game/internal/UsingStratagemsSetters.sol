// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./UsingStratagemsState.sol";
import "../interface/UsingStratagemsEvents.sol";
import "./UsingStratagemsUtils.sol";
import "../../utils/PositionUtils.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/UsingERC721Events.sol";

abstract contract UsingStratagemsSetters is UsingStratagemsState, UsingStratagemsUtils, UsingERC721Events {
    using PositionUtils for uint64;

    constructor(Config memory config) UsingStratagemsState(config) {}

    function _makeCommitment(address player, bytes24 commitmentHash, uint256 inReserve) internal {
        Commitment storage commitment = _commitments[player];

        (uint24 epoch, bool commiting) = _epoch();

        if (!commiting) {
            revert InRevealPhase();
        }
        if (commitment.epoch != 0 && commitment.epoch != epoch) {
            revert PreviousCommitmentNotRevealed();
        }

        commitment.hash = commitmentHash;
        commitment.epoch = epoch;

        // for withdrawal, we still require a minimal reserve so player cannot change their mind without losing at least one token
        // TODO we might want to increase that value to 10x as 10 moves might quite common, at least on some networks
        // if (inReserve < NUM_TOKENS_PER_GEMS) {
        //     // TODO? special error for this case ?
        //     revert ReserveTooLow(inReserve, NUM_TOKENS_PER_GEMS);
        // }

        emit CommitmentMade(player, epoch, commitmentHash);
    }

    function _resolveMoves(
        address player,
        uint24 epoch,
        Move[] memory moves,
        address tokenGiver
    ) internal returns (uint256 newReserveAmount) {
        // max number of transfer is (4+1) * moves.length
        // (for each move's cell's neighbours potentially being a different account)
        // limiting the number of move per commitment reveal to 32 or, even more probably, should cover this unlikely scenario
        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](moves.length * 5),
            numTransfers: 0
        });
        MoveTokens memory tokens;
        for (uint256 i = 0; i < moves.length; i++) {
            (uint256 placed, uint256 burnt, uint256 returned) = _computeMove(
                transferCollection,
                player,
                epoch,
                moves[i]
            );

            tokens.tokensPlaced += placed;
            tokens.tokensBurnt += burnt;
            tokens.tokensReturned += returned;
        }

        // logger.logTransfers(0, "resolveMoves", transferCollection);

        newReserveAmount = _tokensInReserve[player];

        // Note: even if funds can comes from outside the reserve, we still check it
        // This ensure player have to have a reserve and cannot escape the slash if not
        if (newReserveAmount < tokens.tokensPlaced + tokens.tokensBurnt) {
            // TODO add in the tokens.returned from Color.None move
            revert ReserveTooLow(newReserveAmount, tokens.tokensPlaced + tokens.tokensBurnt);
        }
        if (tokenGiver == address(0)) {
            newReserveAmount -= tokens.tokensPlaced + tokens.tokensBurnt;
            _tokensInReserve[player] = newReserveAmount;
        } else {
            if (tokens.tokensPlaced != 0) {
                TOKENS.transferFrom(tokenGiver, address(this), tokens.tokensPlaced);
            }
            if (tokens.tokensBurnt != 0) {
                TOKENS.transferFrom(tokenGiver, BURN_ADDRESS, tokens.tokensBurnt);
            }
        }

        // TODO option to return in reserve ?
        if (tokens.tokensReturned != 0) {
            // console.log("tokensReturned");
            // console.log(tokens.tokensReturned);
            _collectTransfer(transferCollection, TokenTransfer({to: payable(player), amount: tokens.tokensReturned}));
        }

        _multiTransfer(TOKENS, transferCollection);
    }

    function _countBits(uint8 n) internal pure returns (uint8 count) {
        while (n != 0) {
            n = n & (n - 1);
            count++;
        }
    }

    function _placeColor(
        address player,
        Cell memory currentState,
        Move memory move,
        uint24 epoch,
        int8 newDelta,
        uint8 newEnemyMap
    ) internal {
        int8 oldEffectiveDelta = _effectiveDelta(currentState.delta, currentState.enemyMap);
        uint8 oldLife = currentState.life;

        currentState.enemyMap = newEnemyMap;

        if (currentState.color == Color.Evil && currentState.life != 0) {
            unchecked {
                currentState.stake += 1;
                if (currentState.stake == 0) {
                    // we cap it, losing stake there
                    // TODO reevaluate
                    // send it to special address ?
                    currentState.stake = 255;
                }
            }
        } else {
            currentState.stake = 1;
            currentState.producingEpochs = 0;
        }

        currentState.delta = newDelta;
        currentState.life = 2;
        currentState.lastEpochUpdate = epoch;

        address oldOwner = _ownerOf(move.position);

        int8 newEffectiveDelta = _effectiveDelta(currentState.delta, currentState.enemyMap);

        if (currentState.color == Color.Evil) {
            if (oldOwner != 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF) {
                if (oldOwner == address(0)) {
                    if (newEffectiveDelta > 0) {
                        GENERATOR.add(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF, NUM_TOKENS_PER_GEMS);
                    }
                } else {
                    if (oldEffectiveDelta <= 0 && newEffectiveDelta > 0) {
                        GENERATOR.add(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF, NUM_TOKENS_PER_GEMS * 2);
                    } else if (oldEffectiveDelta > 0 && newEffectiveDelta <= 0) {
                        GENERATOR.remove(oldOwner, NUM_TOKENS_PER_GEMS);
                    } else if (oldEffectiveDelta <= 0 && newEffectiveDelta <= 0) {} else if (
                        oldEffectiveDelta > 0 && newEffectiveDelta > 0
                    ) {
                        if (oldLife > 0) {
                            GENERATOR.remove(oldOwner, NUM_TOKENS_PER_GEMS);
                            GENERATOR.add(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF, NUM_TOKENS_PER_GEMS * 2);
                        } else {
                            GENERATOR.add(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF, NUM_TOKENS_PER_GEMS * 1);
                        }
                    }
                }

                emit Transfer(oldOwner, 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF, move.position);
                _owners[move.position] = uint256(uint160(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF));
            } else if (newEffectiveDelta > 0) {
                GENERATOR.add(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF, NUM_TOKENS_PER_GEMS);
            }
        } else {
            if (currentState.epochWhenTokenIsAdded != epoch && oldEffectiveDelta > 0) {
                // here we are dealing with a color replacement and so we need to consider points removal
                GENERATOR.remove(player, NUM_TOKENS_PER_GEMS);
            }
            if (newEffectiveDelta > 0) {
                GENERATOR.add(player, NUM_TOKENS_PER_GEMS);
            }
            emit Transfer(address(0), player, move.position);
            _owners[move.position] = uint256(uint160(player));
        }
    }

    // Note on COLLISION
    // If one color was used more than other, we could consider the cell having N owner and N times the number of tokens
    // such cells would be a good target for others
    // On the other end, on winning agains other cells, owner of such cell would have to divide the winnings
    // TODO revisit this
    // we could also refund the part
    // so if there is 3 green 2 blue and 1 red, then green win and the cell become green
    // player who put blue or red get refunded their respective gems
    // the players who put green get refunded 2/3 so that the cell still contains only 1
    // if there was 3 green and 3 blue and 1 red then the cell becomes black
    // every player get refunded 6/7 so that the black cell only has 1
    // note that the issue with green winning above is that winnings need to be distributed to all 3 players who put green
    // and since the number is technically unbounded, we have to use a splitter contract where player withdraw their winnings
    // this add UX complexity and some cost for withdrawals
    // it also remove the ability to transfer the cell unless agreement and implementation for this
    // So the conclusion is to make it black in all cases and keep the amount
    function _computeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 epoch,
        Move memory move
    ) internal returns (uint256 tokensPlaced, uint256 tokensBurnt, uint256 tokensReturned) {
        (Cell memory currentState, bool justDied) = _getUpdatedCell(move.position, epoch);

        // logger.logPosition("move", move.position);
        // logger.logCell(0, string.concat("_computeMove at epoch ", Strings.toString(epoch)), move.position, currentState, address(uint160(_owners[move.position])));

        // we might have distribution still to do
        uint8 distribution = currentState.distribution;
        if (justDied) {
            // if we just died
            // we have to distribute to all
            distribution = (currentState.enemyMap << 4) + _countBits(currentState.enemyMap);

            /// we are now dead for real
            currentState.lastEpochUpdate = 0;
        }

        // we then apply our move:

        // first we do some validity checks
        if (move.color == Color.None) {
            if (currentState.life != MAX_LIFE || _ownerOf(move.position) != player) {
                // invalid move
                // return (0, 0, NUM_TOKENS_PER_GEMS); // This is wrong ?
                return (0, 0, 0); // TODO return tokens
            }

            _collectTransfer(transferCollection, TokenTransfer({to: payable(player), amount: NUM_TOKENS_PER_GEMS}));
        }
        // then we consider the case of collision and transform such move as Color Evil
        else if (currentState.epochWhenTokenIsAdded == epoch) {
            if (currentState.life != 0) {
                move.color = Color.Evil;
            } else {
                if (currentState.life != MAX_LIFE || _ownerOf(move.position) != player) {
                    // invalid move
                    // return (0, 0, NUM_TOKENS_PER_GEMS); // This is wrong ?
                    return (0, 0, 0); // TODO return tokens
                }
            }
            // we keep currentState.epochWhenTokenIsAdded as we do not want to be overwritten by conflcit: black
        }
        emit MoveProcessed(move.position, player, currentState.color, move.color);

        return _completeMove(transferCollection, player, epoch, move, currentState, distribution);

        // logger.logCell(0,string.concat("AFTER ", Strings.toString(epoch)),move.position,currentState,address(uint160(_owners[move.position])));
    }

    function _completeMove(
        TokenTransferCollection memory transferCollection,
        address player,
        uint24 epoch,
        Move memory move,
        Cell memory currentState,
        uint8 distribution
    ) internal returns (uint256 tokensPlaced, uint256 tokensBurnt, uint256 tokensReturned) {
        unchecked {
            // this is not so much newDelta than delta
            (int8 newDelta, uint8 newEnemyMap) = _propagate(
                transferCollection,
                move,
                epoch,
                currentState.color,
                distribution,
                currentState.stake
            );

            currentState.color = move.color;
            currentState.distribution = 0;
            if (!(_ownerOf(move.position) == player && currentState.life > 0)) {
                // we do not reset "epochWhenTokenIsAdded" when same player
                // this prevent other player to place color while it replace color
                currentState.epochWhenTokenIsAdded = epoch; // used to prevent overwriting, even Color.None
            }

            if (currentState.color == Color.None) {
                int8 oldEffectiveDelta = _effectiveDelta(currentState.delta, currentState.enemyMap);
                currentState.producingEpochs += epoch - currentState.lastEpochUpdate;
                currentState.life = 0;
                currentState.stake = 0;
                currentState.lastEpochUpdate = 0;
                currentState.delta = 0;
                currentState.enemyMap = 0;
                emit Transfer(_ownerOf(move.position), address(0), move.position);
                _owners[move.position] = 0;
                // tokensReturned = NUM_TOKENS_PER_GEMS; // TODO enable when we check reserve for this amount
                if (oldEffectiveDelta > 0) {
                    GENERATOR.remove(player, NUM_TOKENS_PER_GEMS);
                }
            } else {
                tokensPlaced = NUM_TOKENS_PER_GEMS;

                _placeColor(player, currentState, move, epoch, newDelta, newEnemyMap);
            }

            _cells[move.position] = currentState;
        }
    }

    // this can work like in conquest as even though the world works in epoch
    //  we do not mind if a player could use another play moves to go further
    //  they would just need to ensure their reveal is in order
    //  In practise though player would not need this as the discovery gap should be big enough
    // But an alternative to tracking the 4 discovery point, would be to ask player to provide land position
    //  for the 4 direction. THey could also provide only one position for all 4 if that is enough
    // NOTE: would need to set initial discovery:
    // `_discovered = Discovered({
    //         minX: _initialSpaceExpansion,
    //         maxX: _initialSpaceExpansion,
    //         minY: _initialSpaceExpansion,
    //         maxY: _initialSpaceExpansion
    //     });
    //     emit Initialized(
    //         _initialSpaceExpansion,
    //     );`
    // // solhint-disable-next-line code-complexity
    // function _setDiscoveryAfterStaking(uint256 location) internal returns (bool invalid) {
    //     Discovered memory discovered = _discovered;
    //     uint32 _expansionDelta = 12;

    //     (int32 x32, int32 y32) = PositionUtils.toXY(uint64(location));
    //     int256 x = (int40(x32));
    //     int256 y = (int40(y32));

    //     int40 UINT32_MAX = 0xffffffff;

    //     bool changes = false;
    //     if (x < 0) {
    //         if (-x > int256(uint256(discovered.minX))) {
    //             return false;
    //         }
    //         x = -x + int32(_expansionDelta);
    //         if (x > UINT32_MAX) {
    //             x = UINT32_MAX;
    //         }
    //         if (int256(uint256(discovered.minX)) < x) {
    //             discovered.minX = uint32(uint256(x));
    //             changes = true;
    //         }
    //     } else {
    //         if (x > int256(uint256(discovered.maxX))) {
    //             return false;
    //         }
    //         x = x + int32(_expansionDelta);
    //         if (x > UINT32_MAX) {
    //             x = UINT32_MAX;
    //         }
    //         if (discovered.maxX < uint32(uint256(x))) {
    //             discovered.maxX = uint32(uint256(x));
    //             changes = true;
    //         }
    //     }

    //     if (y < 0) {
    //         if (-y > int256(uint256(discovered.minY))) {
    //             return false;
    //         }
    //         y = -y + int32(_expansionDelta);
    //         if (y > UINT32_MAX) {
    //             y = UINT32_MAX;
    //         }
    //         if (int256(uint256(discovered.minY)) < y) {
    //             discovered.minY = uint32(uint256(y));
    //             changes = true;
    //         }
    //     } else {
    //         if (y > int256(uint256(discovered.maxY))) {
    //             return false;
    //         }
    //         y = y + int32(_expansionDelta);
    //         if (y > UINT32_MAX) {
    //             y = UINT32_MAX;
    //         }
    //         if (int256(uint256(discovered.maxY)) < y) {
    //             discovered.maxY = uint32(uint256(y));
    //             changes = true;
    //         }
    //     }
    //     if (changes) {
    //         _discovered = discovered;
    //     }
    // }

    function _propagate(
        TokenTransferCollection memory transferCollection,
        Move memory move,
        uint24 epoch,
        Color color,
        uint8 distribution,
        uint8 stake
    ) internal returns (int8 newDelta, uint8 newEnemyMap) {
        (
            int8 newComputedDelta,
            uint8 newComputedEnemyMap,
            uint16 numDue,
            address[4] memory ownersToPay
        ) = _updateNeighbours(move.position, epoch, color, move.color, distribution);

        if (numDue > 0) {
            _collectTransfer(
                transferCollection,
                TokenTransfer({to: payable(_ownerOf(move.position)), amount: (numDue * NUM_TOKENS_PER_GEMS) / 12})
            );
        }
        for (uint8 i = 0; i < 4; i++) {
            if (ownersToPay[i] != address(0)) {
                _collectTransfer(
                    transferCollection,
                    TokenTransfer({
                        to: payable(ownersToPay[i]),
                        amount: stake * (NUM_TOKENS_PER_GEMS / (distribution & 0x0f))
                    })
                );
            }
        }
        newDelta = newComputedDelta;
        newEnemyMap = newComputedEnemyMap;
    }

    function _poke(TokenTransferCollection memory transferCollection, uint64 position, uint24 epoch) internal {
        (Cell memory currentState, bool justDied) = _getUpdatedCell(position, epoch);

        // logger.logCell(0,string.concat("_poke at epoch ", Strings.toString(epoch)),position,currentState,address(uint160(_owners[position])));

        // we might have distribution still to do
        uint8 distribution = currentState.distribution;
        if (justDied) {
            // if we just died
            // we have to distribute to all
            distribution = (currentState.enemyMap << 4) + _countBits(currentState.enemyMap);

            /// we are now dead for real
            currentState.lastEpochUpdate = 0;
        }

        (, , uint16 numDue, address[4] memory ownersToPay) = _updateNeighbours(
            position,
            epoch,
            currentState.color,
            currentState.color,
            distribution
        );

        if (numDue > 0) {
            _collectTransfer(
                transferCollection,
                TokenTransfer({to: payable(_ownerOf(position)), amount: (numDue * NUM_TOKENS_PER_GEMS) / 12})
            );
        }
        for (uint8 i = 0; i < 4; i++) {
            if (ownersToPay[i] != address(0)) {
                _collectTransfer(
                    transferCollection,
                    TokenTransfer({
                        to: payable(ownersToPay[i]),
                        amount: currentState.stake * (NUM_TOKENS_PER_GEMS / (distribution & 0x0f))
                    })
                );
            }
        }

        // logger.logCell(0,string.concat("AFTER poke (before zeroed distribution) at epoch ", Strings.toString(epoch)),position,currentState,address(uint160(_owners[position])));

        currentState.distribution = 0;
        _cells[position] = currentState;
    }

    struct CellUpdate {
        int8 delta;
        uint8 enemymap;
        uint16 due;
    }
    function _updateUP(
        address[4] memory ownersToPay,
        CellUpdate memory cellUpdate,
        uint64 position,
        uint24 epoch,
        uint8 distribution,
        Color oldColor,
        Color newColor
    ) internal {
        uint64 upPosition = position.offset(0, -1);
        (int8 enemyOrFriend, uint16 due) = _updateCell(
            CellUpdateData({
                position: upPosition,
                epoch: epoch,
                neighbourIndex: 2,
                oldColor: oldColor,
                newColor: newColor
            })
        );
        if (enemyOrFriend < 0) {
            cellUpdate.enemymap = cellUpdate.enemymap | 1;
        }
        cellUpdate.due += due;
        cellUpdate.delta += enemyOrFriend;

        if ((distribution >> 4) & 1 == 1) {
            ownersToPay[0] = _ownerOf(upPosition);
        }
    }
    function _updateLEFT(
        address[4] memory ownersToPay,
        CellUpdate memory cellUpdate,
        uint64 position,
        uint24 epoch,
        uint8 distribution,
        Color oldColor,
        Color newColor
    ) internal {
        uint64 leftPosition = position.offset(-1, 0);
        (int8 enemyOrFriend, uint16 due) = _updateCell(
            CellUpdateData({
                position: leftPosition,
                epoch: epoch,
                neighbourIndex: 3,
                oldColor: oldColor,
                newColor: newColor
            })
        );
        if (enemyOrFriend < 0) {
            cellUpdate.enemymap = cellUpdate.enemymap | 2;
        }
        cellUpdate.due += due;
        cellUpdate.delta += enemyOrFriend;

        if ((distribution >> 4) & 2 == 2) {
            ownersToPay[1] = _ownerOf(leftPosition);
        }
    }

    function _updateDOWN(
        address[4] memory ownersToPay,
        CellUpdate memory cellUpdate,
        uint64 position,
        uint24 epoch,
        uint8 distribution,
        Color oldColor,
        Color newColor
    ) internal {
        uint64 downPosition = position.offset(0, 1);
        (int8 enemyOrFriend, uint16 due) = _updateCell(
            CellUpdateData({
                position: downPosition,
                epoch: epoch,
                neighbourIndex: 0,
                oldColor: oldColor,
                newColor: newColor
            })
        );
        if (enemyOrFriend < 0) {
            cellUpdate.enemymap = cellUpdate.enemymap | 4;
        }
        cellUpdate.due += due;
        cellUpdate.delta += enemyOrFriend;

        if ((distribution >> 4) & 4 == 4) {
            ownersToPay[2] = _ownerOf(downPosition);
        }
    }

    function _updateRIGHT(
        address[4] memory ownersToPay,
        CellUpdate memory cellUpdate,
        uint64 position,
        uint24 epoch,
        uint8 distribution,
        Color oldColor,
        Color newColor
    ) internal {
        uint64 rightPosition = position.offset(1, 0);
        (int8 enemyOrFriend, uint16 due) = _updateCell(
            CellUpdateData({
                position: rightPosition,
                epoch: epoch,
                neighbourIndex: 1,
                oldColor: oldColor,
                newColor: newColor
            })
        );
        if (enemyOrFriend < 0) {
            cellUpdate.enemymap = cellUpdate.enemymap | 8;
        }
        cellUpdate.due += due;
        cellUpdate.delta += enemyOrFriend;

        if ((distribution >> 4) & 8 == 8) {
            ownersToPay[3] = _ownerOf(rightPosition);
        }
    }

    function _updateNeighbours(
        uint64 position,
        uint24 epoch,
        Color oldColor,
        Color newColor,
        uint8 distribution
    ) internal returns (int8 newDelta, uint8 newEnemyMap, uint16 numDue, address[4] memory ownersToPay) {
        CellUpdate memory cellUpdate;
        _updateUP(ownersToPay, cellUpdate, position, epoch, distribution, oldColor, newColor);
        _updateLEFT(ownersToPay, cellUpdate, position, epoch, distribution, oldColor, newColor);
        _updateDOWN(ownersToPay, cellUpdate, position, epoch, distribution, oldColor, newColor);
        _updateRIGHT(ownersToPay, cellUpdate, position, epoch, distribution, oldColor, newColor);
        newDelta = cellUpdate.delta;
        newEnemyMap = cellUpdate.enemymap;
        numDue = cellUpdate.due;
    }

    struct CellUpdateData {
        uint64 position; // position to update
        uint24 epoch;
        uint8 neighbourIndex; // index from point of view of cell being updated
        Color oldColor; // old Color of the neighbor
        Color newColor; // new color of the neighbor
    }
    /// @dev This update the cell in storage
    function _updateCell(CellUpdateData memory data) internal returns (int8 enemyOrFriend, uint16 due) {
        Cell memory cell = _cells[data.position];

        uint24 lastUpdate = cell.lastEpochUpdate;
        Color color = cell.color;
        if (color != Color.None) {
            // if the color of the cell being update is not Nome
            // we then check the neighbor new color
            // if it same as the cell color, then we report the cell as friendly to the neighbor
            // else it is an enemy
            // note that _updateCell should only be called if oldColor != newColor
            enemyOrFriend = color == data.newColor ? int8(1) : int8(-1);
        }
        if (lastUpdate >= 1 && color != Color.None) {
            // we only consider cell with color that are not dead
            if (cell.life > 0 && lastUpdate < data.epoch) {
                // of there is life to update we compute the new life
                (uint8 newLife, ) = _computeNewLife(lastUpdate, cell.enemyMap, cell.delta, cell.life, data.epoch);
                due = _updateCellFromNeighbor(data, cell, newLife);
            } else {
                due = _updateCellFromNeighbor(data, cell, cell.life);
            }
        }
    }

    function _updateCellFromNeighbor(
        CellUpdateData memory data,
        Cell memory cell, // cell to be updated
        uint8 newLife // new life value for the cell
    ) internal returns (uint16 due) {
        if (cell.life > 0 && newLife == 0) {
            // we just died, we establish the distributionMap and counts
            // logger.logPosition("new distribution", position);
            cell.distribution = (cell.enemyMap << 4) + _countBits(cell.enemyMap);
            // console.log("%i %i", cell.distribution >> 4, cell.distribution & 0x0F);
        }

        // logger.logCell(0,string.concat("_updateCellFromNeighbor  index", Strings.toString(neighbourIndex)),position,cell,address(uint160(_owners[position])));

        if ((cell.distribution >> 4) & (2 ** data.neighbourIndex) == 2 ** data.neighbourIndex) {
            due = (cell.stake * 12) / (cell.distribution & 0x0f); // TODO if stake too high we have a problem

            cell.distribution =
                (uint8(uint256(cell.distribution >> 4) & (~(2 ** uint256(data.neighbourIndex)))) << 4) +
                (cell.distribution & 0x0f);
        }

        int8 oldEffectiveDelta = _effectiveDelta(cell.delta, cell.enemyMap);

        _handleColor(cell, data.neighbourIndex, data.oldColor, data.newColor);

        _setCell(data.position, cell, newLife, data.epoch, oldEffectiveDelta);

        // logger.logCell(0,string.concat("AFTER _updateCellFromNeighbor  index", Strings.toString(neighbourIndex)),position,cell,address(uint160(_owners[position])));

        _cells[data.position] = cell;
    }

    function _setCell(
        uint64 position, // position of the cell to be updated
        Cell memory cell, // cell to be updated
        uint8 newLife, // new life value for the celll
        uint24 epoch, // epoch at which the update occured (epochUsed TODO: confirm its use)
        int8 oldEffectiveDelta
    ) internal {
        address owner = _ownerOf(position);
        if (owner != address(0) && newLife > 0) {
            int8 newEffectiveDelta = _effectiveDelta(cell.delta, cell.enemyMap);
            if (oldEffectiveDelta > 0 && newEffectiveDelta <= 0) {
                GENERATOR.remove(owner, NUM_TOKENS_PER_GEMS * cell.stake);
            } else if (oldEffectiveDelta <= 0 && newEffectiveDelta > 0) {
                GENERATOR.add(owner, NUM_TOKENS_PER_GEMS * cell.stake);
            }
        }

        if (oldEffectiveDelta > 0) {
            cell.producingEpochs += epoch - cell.lastEpochUpdate;
        }

        cell.lastEpochUpdate = epoch;
        cell.life = newLife;
    }

    function _handleColor(
        Cell memory cell, // cell to be updated
        uint8 neighbourIndex, // the neighbor triggering the update and for which we return whether it should receive its due
        Color oldColor, // old color of that neighbor
        Color newColor // new color of that neighbor
    ) internal pure {
        if (oldColor != newColor) {
            if (newColor == Color.None) {
                if (cell.color == oldColor) {
                    cell.delta -= 1;
                } else {
                    cell.delta += 1;
                    cell.enemyMap = cell.enemyMap & uint8((1 << neighbourIndex) ^ 0xFF);
                }
            } else if (cell.color == oldColor) {
                // then newColor is different (see assert above)
                cell.enemyMap = cell.enemyMap | uint8(1 << neighbourIndex);
                cell.delta -= 2;
            } else if (cell.color == newColor) {
                // then old color was different
                cell.delta += (oldColor == Color.None ? int8(1) : int8(2));
                cell.enemyMap = cell.enemyMap & uint8((1 << neighbourIndex) ^ 0xFF);
            } else if (oldColor == Color.None) {
                // if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
                cell.delta -= 1;
                cell.enemyMap = cell.enemyMap | uint8(1 << neighbourIndex);
            }
        }
    }
}

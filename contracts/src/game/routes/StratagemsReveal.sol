// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsSetters.sol";
import "../internal/UsingStratagemsUtils.sol";

contract StratagemsReveal is IStratagemsReveal, UsingStratagemsSetters {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @inheritdoc IStratagemsReveal
    function reveal(
        address player,
        bytes32 secret,
        Move[] calldata moves,
        bytes24 furtherMoves,
        bool useReserve,
        address payable payee
    ) external payable {
        Commitment storage commitment = _commitments[player];
        (uint24 epoch, bool commiting) = _epoch();

        if (commiting) {
            revert InCommitmentPhase();
        }
        if (commitment.epoch == 0) {
            revert NothingToReveal();
        }
        if (commitment.epoch != epoch) {
            revert InvalidEpoch();
        }

        _checkHash(commitment.hash, secret, moves, furtherMoves);

        uint256 newReserveAmount = _resolveMoves(player, epoch, moves, useReserve ? address(0) : player);

        bytes24 hashRevealed = commitment.hash;
        if (furtherMoves != bytes24(0)) {
            if (moves.length != MAX_NUM_MOVES_PER_HASH) {
                revert InvalidFurtherMoves();
            }
            commitment.hash = furtherMoves;
        } else {
            commitment.epoch = 0; // used
        }

        emit CommitmentRevealed(player, epoch, hashRevealed, moves, furtherMoves, newReserveAmount);

        if (payee != address(0)) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsReveal
    function acknowledgeMissedReveal(
        address player,
        bytes32 secret,
        Move[] calldata moves,
        bytes24 furtherMoves
    ) external {
        Commitment storage commitment = _commitments[player];
        (uint24 epoch, ) = _epoch();
        if (commitment.epoch == 0 || commitment.epoch == epoch) {
            revert CanStillReveal();
        }

        uint256 numMoves = moves.length;

        _checkHash(commitment.hash, secret, moves, furtherMoves);

        if (furtherMoves != bytes24(0)) {
            if (numMoves != MAX_NUM_MOVES_PER_HASH) {
                revert InvalidFurtherMoves();
            }
            commitment.hash = furtherMoves;
        } else {
            commitment.epoch = 0; // used
        }

        uint256 amount = moves.length * NUM_TOKENS_PER_GEMS;
        _tokensInReserve[msg.sender] -= amount;
        TOKENS.transfer(BURN_ADDRESS, amount);
        emit CommitmentVoid(player, epoch, amount, furtherMoves);
    }

    /// @inheritdoc IStratagemsReveal
    function acknowledgeMissedRevealByBurningAllReserve() external {
        Commitment storage commitment = _commitments[msg.sender];
        (uint24 epoch, ) = _epoch();

        if (commitment.epoch == 0) {
            revert NothingToReveal();
        }

        if (commitment.epoch == epoch) {
            revert CanStillReveal();
        }

        commitment.epoch = 0;
        uint256 amount = _tokensInReserve[msg.sender];
        _tokensInReserve[msg.sender] = 0;
        TOKENS.transfer(BURN_ADDRESS, amount);

        // here we cannot know whether there were further move or even any moves
        // we just burn all tokens in reserve
        emit CommitmentVoid(msg.sender, epoch, amount, bytes24(0));
    }
}

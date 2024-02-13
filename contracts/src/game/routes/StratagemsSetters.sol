// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsSetters.sol";
import "../internal/UsingStratagemsUtils.sol";

contract StratagemsSetters is IStratagemsSetters, UsingStratagemsSetters {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @inheritdoc IStratagemsSetters
    function addToReserve(uint256 tokensAmountToAdd, Permit calldata permit) external {
        if (tokensAmountToAdd > 0) {
            uint256 newAmount = _tokensInReserve[msg.sender];
            newAmount += tokensAmountToAdd;
            _tokensInReserve[msg.sender] = newAmount;

            if (permit.value > 0) {
                TOKENS.permit(msg.sender, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
            }
            TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
            emit ReserveDeposited(msg.sender, tokensAmountToAdd, newAmount);
        }
    }

    /// @inheritdoc IStratagemsSetters
    function makeCommitment(bytes24 commitmentHash, address payable payee) external payable {
        _makeCommitment(msg.sender, commitmentHash, _tokensInReserve[msg.sender]);
        if (payee != address(0)) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsSetters
    function makeCommitmentWithExtraReserve(
        bytes24 commitmentHash,
        uint256 tokensAmountToAdd,
        Permit calldata permit,
        address payable payee
    ) external payable {
        uint256 inReserve = _tokensInReserve[msg.sender];
        inReserve += tokensAmountToAdd;
        _tokensInReserve[msg.sender] = inReserve;

        _makeCommitment(msg.sender, commitmentHash, inReserve);

        if (permit.value > 0) {
            TOKENS.permit(msg.sender, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
        }

        if (tokensAmountToAdd > 0) {
            TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
            emit ReserveDeposited(msg.sender, tokensAmountToAdd, inReserve);
        }

        if (payee != address(0)) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsSetters
    function cancelCommitment() external {
        Commitment storage commitment = _commitments[msg.sender];
        (uint24 epoch, bool commiting) = _epoch();
        if (!commiting) {
            revert InRevealPhase();
        }
        if (commitment.epoch != epoch) {
            revert PreviousCommitmentNotRevealed();
        }

        // Note that we do not reset the hash
        // This ensure the slot do not get reset and keep the gas cost consistent across execution
        commitment.epoch = 0;

        emit CommitmentCancelled(msg.sender, epoch);
    }

    /// @inheritdoc IStratagemsSetters
    function withdrawFromReserve(uint256 amount) external {
        Commitment storage commitment = _commitments[msg.sender];

        (uint24 epoch, bool commiting) = _epoch();

        if (commitment.epoch != 0 && (!commiting || commitment.epoch != epoch)) {
            revert PreviousCommitmentNotRevealed();
        }

        uint256 inReserve = _tokensInReserve[msg.sender];
        if (amount == type(uint256).max) {
            amount = inReserve;
            inReserve = 0;
        } else {
            if (inReserve < amount) {
                revert ReserveTooLow(inReserve, amount);
            }
            inReserve -= amount;
        }
        _tokensInReserve[msg.sender] = inReserve;
        TOKENS.transfer(msg.sender, amount);
        emit ReserveWithdrawn(msg.sender, amount, inReserve);
    }

    /// @inheritdoc IStratagemsSetters
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

    /// @inheritdoc IStratagemsSetters
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

        uint256 amount = moves.length;
        _tokensInReserve[msg.sender] -= amount;
        TOKENS.transfer(BURN_ADDRESS, amount);
        emit CommitmentVoid(player, epoch, amount, furtherMoves);
    }

    /// @inheritdoc IStratagemsSetters
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

    /// @inheritdoc IStratagemsSetters
    function poke(uint64 position) external {
        (uint24 epoch, ) = _epoch();

        // max number of transfer is 5 (for each neighbour's potentially being a different account + own cell)

        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](5),
            numTransfers: 0
        });
        _poke(transferCollection, position, epoch);

        _multiTransfer(TOKENS, transferCollection);

        emit SinglePoke(epoch, position);
    }

    /// @inheritdoc IStratagemsSetters
    function pokeMultiple(uint64[] calldata positions) external {
        (uint24 epoch, ) = _epoch();

        uint256 numCells = positions.length;
        // max number of transfer is 4 * numCells (for each cell's neighbours potentially being a different account + own cell)
        TokenTransferCollection memory transferCollection = TokenTransferCollection({
            transfers: new TokenTransfer[](numCells * 5),
            numTransfers: 0
        });
        for (uint256 i = 0; i < numCells; i++) {
            _poke(transferCollection, positions[i], epoch);
        }
        _multiTransfer(TOKENS, transferCollection);

        emit MultiPoke(epoch, positions);
    }
}

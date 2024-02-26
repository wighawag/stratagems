// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../interface/IStratagems.sol";
import "../internal/UsingStratagemsSetters.sol";
import "../internal/UsingStratagemsUtils.sol";

contract StratagemsCommit is IStratagemsCommit, UsingStratagemsSetters {
    constructor(Config memory config) UsingStratagemsSetters(config) {}

    /// @inheritdoc IStratagemsCommit
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

    /// @inheritdoc IStratagemsCommit
    function makeCommitment(bytes24 commitmentHash, address payable payee) external payable {
        _makeCommitment(msg.sender, commitmentHash, _tokensInReserve[msg.sender]);
        if (payee != address(0)) {
            payee.transfer(msg.value);
        }
    }

    /// @inheritdoc IStratagemsCommit
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

    /// @inheritdoc IStratagemsCommit
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

    /// @inheritdoc IStratagemsCommit
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
}

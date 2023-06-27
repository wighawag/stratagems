// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/IStratagems.sol';
import '../internal/UsingStratagemsFunctions.sol';

contract StratagemsCore is IStratagemsCore, UsingStratagemsFunctions {
	constructor(Config memory config) UsingStratagemsFunctions(config) {}

	/// @inheritdoc IStratagemsCore
	function cells(uint256 id) external view returns (Cell memory cell) {
		return _cells[id];
	}

	/// @inheritdoc IStratagemsCore
	function tokensInReserve(address account) external view returns (uint256 amount) {
		return _tokensInReserve[account];
	}

	/// @inheritdoc IStratagemsCore
	function commitments(address account) external view returns (Commitment memory commitment) {
		return _commitments[account];
	}

	/// @inheritdoc IStratagemsCore
	function getConfig() external view returns (Config memory config) {
		config.tokens = TOKENS;
		config.burnAddress = BURN_ADDRESS;
		config.startTime = START_TIME;
		config.commitPhaseDuration = COMMIT_PHASE_DURATION;
		config.resolutionPhaseDuration = RESOLUTION_PHASE_DURATION;
		config.maxLife = MAX_LIFE;
		config.numTokensPerGems = NUM_TOKENS_PER_GEMS;
	}

	/// @inheritdoc IStratagemsCore
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

	/// @inheritdoc IStratagemsCore
	function makeCommitment(bytes24 commitmentHash) external {
		_makeCommitment(msg.sender, commitmentHash, _tokensInReserve[msg.sender]);
	}

	/// @inheritdoc IStratagemsCore
	function makeCommitmentWithExtraReserve(
		bytes24 commitmentHash,
		uint256 tokensAmountToAdd,
		Permit calldata permit
	) external {
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
	}

	/// @inheritdoc IStratagemsCore
	function withdrawFromReserve(uint256 amount) external {
		Commitment storage commitment = _commitments[msg.sender];

		(uint32 epoch, bool commiting) = _epoch();

		require(commitment.epoch == 0 || (commiting && commitment.epoch == epoch), 'PREVIOUS_COMMITMENT_TO_RESOLVE');

		uint256 inReserve = _tokensInReserve[msg.sender];
		if (amount == type(uint256).max) {
			amount = inReserve;
			inReserve = 0;
		} else {
			require(amount <= inReserve, 'NOT_ENOUGH');
			inReserve -= amount;
		}
		_tokensInReserve[msg.sender] = inReserve;
		TOKENS.transfer(msg.sender, amount);
		emit ReserveWithdrawn(msg.sender, amount, inReserve);
	}

	/// @inheritdoc IStratagemsCore
	function resolve(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves,
		bool useReserve
	) external {
		Commitment storage commitment = _commitments[player];
		(uint32 epoch, bool commiting) = _epoch();

		require(!commiting, 'IN_COMMITING_PHASE');
		require(commitment.epoch != 0, 'NOTHING_TO_RESOLVE');
		require(commitment.epoch == epoch, 'INVALID_EPOCH');

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		uint256 newReserveAmount = _resolveMoves(player, epoch, moves, useReserve);

		bytes24 hashResolved = commitment.hash;
		if (furtherMoves != bytes24(0)) {
			require(moves.length == NUM_MOVES_PER_HASH, 'INVALID_FURTHER_MOVES');
			commitment.hash = furtherMoves;
		} else {
			commitment.epoch = 0; // used
		}

		emit CommitmentResolved(player, epoch, hashResolved, moves, furtherMoves, newReserveAmount);
	}

	/// @inheritdoc IStratagemsCore
	function acknowledgeMissedResolution(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves
	) external {
		Commitment storage commitment = _commitments[player];
		(uint32 epoch, ) = _epoch();
		require(commitment.epoch > 0 && commitment.epoch != epoch, 'NO_NEED');

		uint256 numMoves = moves.length;

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		if (furtherMoves != bytes24(0)) {
			require(numMoves == NUM_MOVES_PER_HASH, 'INVALID_FURTHER_MOVES');
			commitment.hash = furtherMoves;
		} else {
			commitment.epoch = 0; // used
		}

		uint256 amount = moves.length;
		_tokensInReserve[msg.sender] -= amount;
		TOKENS.transfer(BURN_ADDRESS, amount);
		emit CommitmentVoid(player, epoch, amount, furtherMoves);
	}

	/// @inheritdoc IStratagemsCore
	function acknowledgeMissedResolutionByBurningAllReserve() external {
		Commitment storage commitment = _commitments[msg.sender];
		(uint32 epoch, ) = _epoch();

		require(commitment.epoch > 0 && commitment.epoch != epoch, 'NO_NEED');
		commitment.epoch = 0;
		uint256 amount = _tokensInReserve[msg.sender];
		_tokensInReserve[msg.sender] = 0;
		TOKENS.transfer(BURN_ADDRESS, amount);

		// here we cannot know whether there were further move or even any moves
		// we just burn all tokens in reserve
		emit CommitmentVoid(msg.sender, epoch, amount, bytes24(0));
	}

	/// @inheritdoc IStratagemsCore
	function poke(uint64 position) external {
		(bool died, TokenTransfer[4] memory distribution) = _poke(position);
		if (died) {
			TokenTransfer[] memory transfers = new TokenTransfer[](4);
			_collectTransfers(transfers, 0, distribution);
			_multiTransfer(transfers);
		}
	}

	/// @inheritdoc IStratagemsCore
	function pokeMultiple(uint64[] calldata positions) external {
		uint256 numCells = positions.length;
		TokenTransfer[] memory transfers = new TokenTransfer[](numCells * 4);
		uint256 offset = 0;
		for (uint256 i = 0; i < numCells; i++) {
			(bool died, TokenTransfer[4] memory distribution) = _poke(positions[i]);
			if (died) {
				offset = _collectTransfers(transfers, offset, distribution);
			}
		}
		_multiTransfer(transfers);
	}
}

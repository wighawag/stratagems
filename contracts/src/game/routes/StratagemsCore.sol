// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/IStratagems.sol';
import '../internal/UsingStratagemsFunctions.sol';

contract StratagemsCore is IStratagemsCore, UsingStratagemsFunctions {
	constructor(Config memory config) UsingStratagemsFunctions(config) {}

	/// @notice There is (2**128) * (2**128) cells
	function cells(uint256 id) external view returns (Cell memory cell) {
		return _cells[id];
	}

	/// @notice the number of token in reserve per account
	///  This is used to slash player who do not resolve their commit
	///  The amount can be greater than the number of token required for the next move
	///  This allow player to potentially hide their intention.
	function tokensInReserve(address account) external view returns (uint256 amount) {
		return _tokensInReserve[account];
	}

	/// @notice The commitment to be resolved. zeroed if no commitment need to be made.
	function commitments(address account) external view returns (Commitment memory commitment) {
		return _commitments[account];
	}

	function getConfig() external view returns (Config memory config) {
		config.tokens = TOKENS;
		config.burnAddress = BURN_ADDRESS;
		config.startTime = START_TIME;
		config.commitPhaseDuration = COMMIT_PHASE_DURATION;
		config.resolutionPhaseDuration = RESOLUTION_PHASE_DURATION;
		config.maxLife = MAX_LIFE;
		config.numTokensPerGems = NUM_TOKENS_PER_GEMS;
	}

	/// @notice called by players to add tokens to their reserve
	/// @param tokensAmountToAdd amount of tokens to add
	/// @param permit permit EIP2612, .value = zero if not needed
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

	/// @notice called by players to commit their moves
	///  this can be called multiple time, the last call overriding the previous.
	/// @param commitmentHash the hash of the moves
	function makeCommitment(bytes24 commitmentHash) external {
		_makeCommitment(msg.sender, commitmentHash, _tokensInReserve[msg.sender]);
	}

	/// @notice called to make a commitment along with tokens to add to the reserve
	/// @param commitmentHash the has of the moves
	/// @param tokensAmountToAdd amount of tokens to add to the reserve. the resulting total must be enough to cover the moves
	/// @param permit permit EIP2612, value = zero if not needed
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

	/// @notice called by players to withdraw tokens from the reserve
	///  can only be called if no commitments are pending
	///  Note that while you can withdraw after commiting, note that if you do not have enough tokens
	///  you'll have your commitment failing.
	/// @param amount number of tokens to withdraw
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

	/// @notice called by player to resolve their commitment
	///  this is where the core logic of the game takes place
	///  This is where the game board evolves
	///  The game is designed so that resolution order do not matter
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
	///  Note that you have to that number of mvoes
	function resolve(address player, bytes32 secret, Move[] calldata moves, bytes24 furtherMoves) external {
		Commitment storage commitment = _commitments[player];
		(uint32 epoch, bool commiting) = _epoch();

		require(!commiting, 'IN_COMMITING_PHASE');
		require(commitment.epoch != 0, 'NOTHING_TO_RESOLVE');
		require(commitment.epoch == epoch, 'INVALID_EPOCH');

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		_resolveMoves(player, epoch, moves);

		bytes24 hashResolved = commitment.hash;
		if (furtherMoves != bytes24(0)) {
			require(moves.length == NUM_MOVES_PER_HASH, 'INVALID_FURTHER_MOVES');
			commitment.hash = furtherMoves;
		} else {
			commitment.epoch = 0; // used
		}

		emit CommitmentResolved(player, epoch, hashResolved, moves, furtherMoves);
	}

	/// @notice called by player if they missed the resolution phase and want to minimze the token loss
	///  By providing the moves, they will be slashed only the amount of token required to make the moves
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
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

	/// @notice should only be called as last resort
	/// this will burn all tokens in reserve
	/// If player has access to the secret, better call acknowledgeMissedResolution
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

	/// @notice poke a position, resolving its virtual state and if dead, reward neighboor enemies colors
	/// @param position the cell position
	function poke(uint64 position) external {
		(bool died, TokenTransfer[4] memory distribution) = _poke(position);
		if (died) {
			TokenTransfer[] memory transfers = new TokenTransfer[](4);
			_collectTransfers(transfers, 0, distribution);
			_multiTransfer(transfers);
		}
	}

	/// poke and collect the tokens won
	/// @param positions cell positions to collect from
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

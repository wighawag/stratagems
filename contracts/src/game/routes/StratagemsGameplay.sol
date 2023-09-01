// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import '../interface/IStratagems.sol';
import '../internal/UsingStratagemsSetters.sol';
import '../internal/UsingStratagemsUtils.sol';

contract StratagemsGameplay is IStratagemsGameplay, UsingStratagemsSetters, UsingStratagemsUtils {
	constructor(Config memory config) UsingStratagemsSetters(config) {}

	// --------------------------------------------------------------------------------------------
	// Getters
	// --------------------------------------------------------------------------------------------

	/// @inheritdoc IStratagemsGameplay
	function getCell(uint256 id) external view returns (FullCell memory) {
		(uint24 epoch, ) = _epoch();
		// console.log('epoch %s', epoch);
		Cell memory updatedCell = _getUpdatedCell(uint64(id), epoch);
		return
			FullCell({
				owner: _ownerOf(id),
				lastEpochUpdate: updatedCell.lastEpochUpdate,
				epochWhenTokenIsAdded: updatedCell.epochWhenTokenIsAdded,
				color: updatedCell.color,
				life: updatedCell.life,
				delta: updatedCell.delta,
				enemyMap: updatedCell.enemyMap,
				distribution: updatedCell.distribution
			});
	}

	/// @inheritdoc IStratagemsGameplay
	function getCells(uint256[] memory ids) external view returns (FullCell[] memory cells) {
		(uint24 epoch, ) = _epoch();
		uint256 numCells = ids.length;
		cells = new FullCell[](numCells);
		for (uint256 i = 0; i < numCells; i++) {
			Cell memory updatedCell = _getUpdatedCell(uint64(ids[i]), epoch);
			cells[i] = FullCell({
				owner: _ownerOf(ids[i]),
				lastEpochUpdate: updatedCell.lastEpochUpdate,
				epochWhenTokenIsAdded: updatedCell.epochWhenTokenIsAdded,
				color: updatedCell.color,
				life: updatedCell.life,
				delta: updatedCell.delta,
				enemyMap: updatedCell.enemyMap,
				distribution: updatedCell.distribution
			});
		}
	}

	/// @inheritdoc IStratagemsGameplay
	function getTokensInReserve(address account) external view returns (uint256 amount) {
		return _tokensInReserve[account];
	}

	/// @inheritdoc IStratagemsGameplay
	function getCommitment(address account) external view returns (Commitment memory commitment) {
		return _commitments[account];
	}

	/// @inheritdoc IStratagemsGameplay
	function getConfig() external view returns (Config memory config) {
		config.tokens = TOKENS;
		config.burnAddress = BURN_ADDRESS;
		config.startTime = START_TIME;
		config.commitPhaseDuration = COMMIT_PHASE_DURATION;
		config.resolutionPhaseDuration = RESOLUTION_PHASE_DURATION;
		config.maxLife = MAX_LIFE;
		config.numTokensPerGems = NUM_TOKENS_PER_GEMS;
	}

	// --------------------------------------------------------------------------------------------
	// Setters
	// --------------------------------------------------------------------------------------------

	/// @inheritdoc IStratagemsGameplay
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

	/// @inheritdoc IStratagemsGameplay
	function makeCommitment(bytes24 commitmentHash) external {
		_makeCommitment(msg.sender, commitmentHash, _tokensInReserve[msg.sender]);
	}

	/// @inheritdoc IStratagemsGameplay
	function makeCommitmentWithExtraReserve(
		bytes24 commitmentHash,
		uint256 tokensAmountToAdd,
		Permit calldata permit
	) external {
		uint256 inReserve = _tokensInReserve[msg.sender];
		inReserve += tokensAmountToAdd;
		_tokensInReserve[msg.sender] = inReserve;

		_makeCommitment(msg.sender, commitmentHash, inReserve);

		// bytes32 PERMIT_TYPEHASH = keccak256(
		// 	'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
		// );
		// bytes32 digest = keccak256(
		// 	abi.encodePacked(
		// 		'\x19\x01',
		// 		TOKENS.DOMAIN_SEPARATOR(),
		// 		keccak256(abi.encode(PERMIT_TYPEHASH, msg.sender, address(this), permit.value, 0, 0))
		// 	)
		// );

		if (permit.value > 0) {
			TOKENS.permit(msg.sender, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
		}

		if (tokensAmountToAdd > 0) {
			TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
			emit ReserveDeposited(msg.sender, tokensAmountToAdd, inReserve);
		}
	}

	/// @inheritdoc IStratagemsGameplay
	function cancelCommitment() external {
		Commitment storage commitment = _commitments[msg.sender];
		(uint24 epoch, bool commiting) = _epoch();
		if (!commiting) {
			revert InResolutionPhase();
		}
		if (commitment.epoch != epoch) {
			revert PreviousCommitmentNotResolved();
		}

		// Note that we do not reset the hash
		// This ensure the slot do not get reset and keep the gas cost consistent across execution
		commitment.epoch = 0;

		emit CommitmentCancelled(msg.sender, epoch);
	}

	/// @inheritdoc IStratagemsGameplay
	function withdrawFromReserve(uint256 amount) external {
		Commitment storage commitment = _commitments[msg.sender];

		(uint24 epoch, bool commiting) = _epoch();

		if (commitment.epoch != 0 && (!commiting || commitment.epoch != epoch)) {
			revert PreviousCommitmentNotResolved();
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

	/// @inheritdoc IStratagemsGameplay
	function resolve(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves,
		bool useReserve
	) external {
		Commitment storage commitment = _commitments[player];
		(uint24 epoch, bool commiting) = _epoch();

		if (commiting) {
			revert InCommitmentPhase();
		}
		if (commitment.epoch == 0) {
			revert NothingToResolve();
		}
		console.log(commitment.epoch);
		console.log(epoch);
		if (commitment.epoch != epoch) {
			revert InvalidEpoch();
		}

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		uint256 newReserveAmount = _resolveMoves(player, epoch, moves, useReserve ? address(0) : player);

		bytes24 hashResolved = commitment.hash;
		if (furtherMoves != bytes24(0)) {
			if (moves.length != MAX_NUM_MOVES_PER_HASH) {
				revert InvalidFurtherMoves();
			}
			commitment.hash = furtherMoves;
		} else {
			commitment.epoch = 0; // used
		}

		emit CommitmentResolved(player, epoch, hashResolved, moves, furtherMoves, newReserveAmount);
	}

	/// @inheritdoc IStratagemsGameplay
	function acknowledgeMissedResolution(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves
	) external {
		Commitment storage commitment = _commitments[player];
		(uint24 epoch, ) = _epoch();
		if (commitment.epoch == 0 || commitment.epoch == epoch) {
			revert CanStillResolve();
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

	/// @inheritdoc IStratagemsGameplay
	function acknowledgeMissedResolutionByBurningAllReserve() external {
		Commitment storage commitment = _commitments[msg.sender];
		(uint24 epoch, ) = _epoch();

		if (commitment.epoch == 0 || commitment.epoch == epoch) {
			revert CanStillResolve();
		}

		commitment.epoch = 0;
		uint256 amount = _tokensInReserve[msg.sender];
		_tokensInReserve[msg.sender] = 0;
		TOKENS.transfer(BURN_ADDRESS, amount);

		// here we cannot know whether there were further move or even any moves
		// we just burn all tokens in reserve
		emit CommitmentVoid(msg.sender, epoch, amount, bytes24(0));
	}

	/// @inheritdoc IStratagemsGameplay
	function poke(uint64 position) external {
		// max number of transfer is 5 (for each neighbour's potentially being a different account + own cell)

		TokenTransferCollection memory transferCollection = TokenTransferCollection({
			transfers: new TokenTransfer[](5),
			numTransfers: 0
		});
		_poke(transferCollection, position);

		_multiTransfer(transferCollection);
		// TODO events?
	}

	/// @inheritdoc IStratagemsGameplay
	function pokeMultiple(uint64[] calldata positions) external {
		uint256 numCells = positions.length;
		// max number of transfer is 4 * numCells (for each cell's neighbours potentially being a different account + own cell)
		TokenTransferCollection memory transferCollection = TokenTransferCollection({
			transfers: new TokenTransfer[](numCells * 5),
			numTransfers: 0
		});
		for (uint256 i = 0; i < numCells; i++) {
			_poke(transferCollection, positions[i]);
		}
		_multiTransfer(transferCollection);
		// TODO events?
	}
}

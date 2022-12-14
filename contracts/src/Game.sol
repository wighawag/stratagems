// SPDX-License-Identifier: AGPL-1.0
pragma solidity ^0.8.13;

import "./Tokens.sol";

contract Game {
	event CommitmentMade(address indexed player, uint32 indexed period, bytes24 commitmentHash);
	event CommitmentVoid(address indexed player, uint32 indexed period, uint256 amountBurnt);
	event CommitmentResolved(
		address indexed player,
		uint32 indexed period,
		bytes24 indexed commitmentHash,
		Move[] moves,
		bytes24 furtherMoves
	);
	event ReserveWithdrawn(address indexed player, uint256 amount);
	event ReserveDeposited(address indexed player, uint256 amount);

	Tokens public immutable TOKENS;
	uint256 public immutable START_TIME;
	uint256 public immutable COMMIT_PERIOD;
	uint256 public immutable RESOLUTION_PERIOD;
	int8 public immutable MAX_LIFE;
	uint8 public immutable DECIMALS;

	struct Config {
		Tokens tokens;
		uint256 startTime;
		uint256 commitPeriod;
		uint256 resolutionPeriod;
		int8 maxLife;
		uint8 decimals;
	}

	constructor(Config memory config) {
		TOKENS = config.tokens;
		START_TIME = config.startTime;
		COMMIT_PERIOD = config.commitPeriod;
		RESOLUTION_PERIOD = config.resolutionPeriod;
		MAX_LIFE = config.maxLife;
		DECIMALS = config.decimals;
	}

	enum Color {
		None,
		Blue,
		Red,
		Green,
		Yellow
	}

	struct Cell {
		address owner;
		uint32 lastPeriodUpdate; // period
		uint32 periodWhenTokenIsAdded; // period
		Color color;
		int8 life;
		int8 delta;
		uint8 enemymask;
	}

	struct Commitment {
		bytes24 hash;
		uint32 period;
	}

	struct Move {
		uint64 position;
		Color color; // Color.None to indicate exit
	}

	struct Permit {
		uint256 value;
		uint256 deadline;
		uint8 v;
		bytes32 r;
		bytes32 s;
	}

	mapping(uint256 => Cell) public cells;
	mapping(address => uint256) public tokensInReserve;
	mapping(address => Commitment) public commitments;
	uint256 public tokensInPlay;

	function addToReserve(uint256 tokensAmountToAdd, Permit calldata permit) external {
		if (tokensAmountToAdd > 0) {
			if (permit.value > 0) {
				TOKENS.permit(msg.sender, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
			}
			tokensInReserve[msg.sender] += tokensAmountToAdd;

			TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
			emit ReserveDeposited(msg.sender, tokensAmountToAdd); // TODO emit the new amount?
		}
	}

	function makeCommitment(bytes24 commitmentHash) external {
		_makeCommitment(msg.sender, commitmentHash, tokensInReserve[msg.sender]);
	}

	function makeCommitmentWithExtraReserve(
		bytes24 commitmentHash,
		uint256 tokensAmountToAdd,
		Permit calldata permit
	) external {
		uint256 inReserve = tokensInReserve[msg.sender];
		inReserve += tokensAmountToAdd;
		tokensInReserve[msg.sender] = inReserve;

		_makeCommitment(msg.sender, commitmentHash, inReserve);

		if (permit.value > 0) {
			TOKENS.permit(msg.sender, address(this), permit.value, permit.deadline, permit.v, permit.r, permit.s);
		}

		if (tokensAmountToAdd > 0) {
			TOKENS.transferFrom(msg.sender, address(this), tokensAmountToAdd);
			emit ReserveDeposited(msg.sender, tokensAmountToAdd); // TODO add total amount in reserve too
		}
	}

	function withdrawFromReserve(uint256 amount) external {
		Commitment storage commitment = commitments[msg.sender];

		require(commitment.period == 0, "COMMITMENT_NOT_RESOLVED");
		uint256 inReserve = tokensInReserve[msg.sender];
		if (amount == type(uint256).max) {
			amount = inReserve;
			inReserve = 0;
		} else {
			require(amount <= inReserve, "NOT_ENOUGH");
			inReserve -= amount;
		}
		tokensInReserve[msg.sender] = inReserve;
		TOKENS.transfer(msg.sender, amount);
		emit ReserveWithdrawn(msg.sender, amount); // TODO emit new amount?
	}

	function resolve(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves
	) external {
		Commitment storage commitment = commitments[player];
		(uint32 period, bool commiting) = _period();

		require(!commiting, "IN_COMMITING_PHASE");
		require(commitment.period != 0, "NOTHING_TO_RESOLVE");
		require(commitment.period == period, "INVALID_PERIOD");

		uint256 numMoves = moves.length;

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		uint256 tokensPlaced = 0;
		uint256 tokensBurnt = 0;
		for (uint256 i = 0; i < numMoves; i++) {
			(uint256 placed, ) = _computeMove(player, period, moves[i]);
			tokensPlaced += placed;
			// tokensBurnt += burnt;
		}

		uint256 amountInReserve = tokensInReserve[player];

		require(amountInReserve >= tokensPlaced + tokensBurnt);
		amountInReserve -= tokensPlaced + tokensBurnt;
		tokensInReserve[player] = amountInReserve;

		tokensInPlay += tokensPlaced;
		// if (tokensBurnt != 0) {
		// 	TOKENS.burn(tokensBurnt);
		// }

		bytes24 hashResolved = commitment.hash;
		if (furtherMoves != bytes24(0)) {
			commitment.hash = furtherMoves;
		} else {
			commitment.period = 0; // used
		}

		emit CommitmentResolved(player, period, hashResolved, moves, furtherMoves);
	}

	function acknowledgeMissedResolution(
		address player,
		bytes32 secret,
		Move[] calldata moves,
		bytes24 furtherMoves
	) external {
		Commitment storage commitment = commitments[player];
		(uint32 period, ) = _period();
		require(commitment.period > 0 && commitment.period != period, "NO_NEED");

		_checkHash(commitment.hash, secret, moves, furtherMoves);

		commitment.period = 0;

		uint256 amount = moves.length;
		tokensInReserve[msg.sender] -= amount;
		TOKENS.burn(amount);

		emit CommitmentVoid(player, period, amount);
	}

	/// @notice should only be called as last resort
	/// this will burn all tokens in reserve (// TODO block adding more to reserve until RESOLUTION is complete)
	/// If player has access to the secret, better call acknowledgeMissedResolution
	function acknowledgeMissedResolutionByBurningAllReserve() external {
		Commitment storage commitment = commitments[msg.sender];
		(uint32 period, ) = _period();

		require(commitment.period > 0 && commitment.period != period, "NO_NEED");
		commitment.period = 0;
		uint256 amount = tokensInReserve[msg.sender];
		tokensInReserve[msg.sender] = 0;
		TOKENS.burn(amount);

		emit CommitmentVoid(msg.sender, period, amount);
	}

	function poke(uint64 position) external {
		(uint32 period, ) = _period();
		Cell storage cell = cells[position];
		uint32 lastUpdate = cell.lastPeriodUpdate;
		Color color = cell.color;
		int8 life = cell.life;
		if (lastUpdate >= 1 && color != Color.None && life > 0) {
			int8 delta = cell.delta;
			int8 effectiveDelta = delta != 0 ? delta : -1;

			uint256 periodDelta = period - lastUpdate;
			// assert  periodDelta >= 0

			if (periodDelta != 0) {
				// update life if any changes
				if (periodDelta > uint32(int32(MAX_LIFE))) {
					periodDelta = uint32(int32(MAX_LIFE));
				}
				life += (int8(uint8(periodDelta)) * effectiveDelta);
				if (life < 0) {
					life = 0;
				}
				if (life > MAX_LIFE) {
					life = MAX_LIFE;
				}
			}

			cell.lastPeriodUpdate = period;
			cell.life = life;
			if (life == 0) {
				_distributeDeath(position, cell.enemymask);
			}
		}
	}

	function collect(uint64 position) external {}

	function pokeAndCollect(uint64[] calldata positions) external {}

	function _makeCommitment(
		address player,
		bytes24 commitmentHash,
		uint256 inReserve
	) internal {
		Commitment storage commitment = commitments[player];

		(uint32 period, bool commiting) = _period();

		require(commiting, "IN_RESOLUTION_PHASE");
		require(commitment.period == 0 || commitment.period == period, "PREVIOUS_COMMITMENT_TO_RESOLVE");

		commitment.hash = commitmentHash;
		commitment.period = period;

		require(inReserve >= DECIMALS, "NEED_AT_LEAST_ONE_TOKEN_IN_RESERVE");

		emit CommitmentMade(player, period, commitmentHash);
	}

	function _period() internal view virtual returns (uint32 period, bool commiting) {
		uint256 periodDuration = COMMIT_PERIOD + RESOLUTION_PERIOD;
		require(block.timestamp >= START_TIME, "GAME_NOT_STARTED");
		uint256 timePassed = block.timestamp - START_TIME;
		period = uint32(timePassed / periodDuration + 1); // period start at 1
		commiting = timePassed - ((period - 1) * periodDuration) < COMMIT_PERIOD;
	}

	function _getNeihbourEnemyPlayers(uint64 position, uint8 enemyMask)
		internal
		view
		returns (address[4] memory enemies, uint8 numEnemies)
	{
		unchecked {
			int256 x = int256(int32(int256(uint256(position) & 0xFFFFFFFF)));
			int256 y = int256(int32(int256(uint256(position) >> 32)));

			if (enemyMask & 1 == 1) {
				enemies[numEnemies] = cells[((uint256(y - 1) << 32) + uint256(x))].owner;
				numEnemies++;
			}
			if (enemyMask & (1 << 1) == (1 << 1)) {
				enemies[numEnemies] = cells[((uint256(y) << 32) + uint256(x - 1))].owner;
				numEnemies++;
			}
			if (enemyMask & (1 << 2) == (1 << 2)) {
				enemies[numEnemies] = cells[((uint256(y + 1) << 32) + uint256(x))].owner;
				numEnemies++;
			}
			if (enemyMask & (1 << 3) == (1 << 3)) {
				enemies[numEnemies] = cells[((uint256(y) << 32) + uint256(x + 1))].owner;
				numEnemies++;
			}
		}
	}

	function _checkHash(
		bytes24 commitmentHash,
		bytes32 secret,
		Move[] memory moves,
		bytes24 furtherMoves
	) internal pure {
		if (furtherMoves != bytes24(0)) {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves, furtherMoves)));
			require(commitmentHash == computedHash, "HASH_NOT_MATCHING");
		} else {
			bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves)));
			require(commitmentHash == computedHash, "HASH_NOT_MATCHING");
		}
	}

	function _getUpdatedCell(uint64 position, uint32 period) internal view returns (Cell memory updatedCell) {
		// load from state
		updatedCell = cells[position];
		uint32 lastUpdate = updatedCell.lastPeriodUpdate;
		if (lastUpdate >= 1) {
			int8 delta = updatedCell.delta;
			int8 life = updatedCell.life;
			int8 effectiveDelta = delta != 0 ? delta : -1;

			uint256 periodDelta = period - lastUpdate;
			// assert  periodDelta >= 0

			if (periodDelta != 0) {
				// update life if any changes
				if (periodDelta > uint32(int32(MAX_LIFE))) {
					periodDelta = uint32(int32(MAX_LIFE));
				}
				life += (int8(uint8(periodDelta)) * effectiveDelta);
				if (life < 0) {
					life = 0;
				}
				if (life > MAX_LIFE) {
					life = MAX_LIFE;
				}
				updatedCell.life = life;
				updatedCell.lastPeriodUpdate = period;
			}
		}
	}

	function _updateCell(
		uint64 position,
		uint32 period,
		uint8 neighbourIndex,
		Color oldColor,
		Color newColor
	) internal returns (int8 enemyOrFriend) {
		Cell storage cell = cells[position];

		// no need to call if oldColor == newColor, so we assume they are different
		assert(oldColor != newColor);
		uint32 lastUpdate = cell.lastPeriodUpdate;
		Color color = cell.color;

		if (lastUpdate >= 1 && color != Color.None) {
			int8 delta = cell.delta;
			int8 life = cell.life;
			int8 effectiveDelta = delta != 0 ? delta : -1;
			uint8 enemymask = cell.enemymask;

			uint256 periodDelta = period - lastUpdate;
			// assert  periodDelta >= 0

			if (periodDelta != 0) {
				// update life if any changes
				if (periodDelta > uint32(int32(MAX_LIFE))) {
					periodDelta = uint32(int32(MAX_LIFE));
				}
				life += (int8(uint8(periodDelta)) * effectiveDelta);
				if (life < 0) {
					life = 0;
				}
				if (life > MAX_LIFE) {
					life = MAX_LIFE;
				}
			}

			if (newColor == Color.None) {
				// COLLISION, previous update added a color that should not be there
				if (color == oldColor) {
					delta -= 1;
				} else {
					delta += 1;
					// remove enemy as it was added by COLLISION
					enemymask = enemymask & uint8((1 << neighbourIndex) ^ 0xFF);
				}
			} else if (color == oldColor) {
				// then newColor is different (see assert above)
				enemymask = enemymask | uint8(1 << neighbourIndex);
				delta -= 2;
			} else if (color == newColor) {
				// then old color was different
				delta += (oldColor == Color.None ? int8(1) : int8(2));
				enemymask = enemymask & uint8((1 << neighbourIndex) ^ 0xFF);
			} else if (oldColor == Color.None) {
				// if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
				delta -= 1;
				enemymask = enemymask | uint8(1 << neighbourIndex);
			}
			cell.delta = delta;
			cell.lastPeriodUpdate = period;
			cell.life = life;

			if (life == 0) {
				_distributeDeath(position, cell.enemymask);
			}

			enemyOrFriend = color == newColor ? int8(1) : int8(-1);
		}
	}

	function _distributeDeath(uint64 position, uint8 enemymask) internal {
		(address[4] memory enemies, uint8 numEnemies) = _getNeihbourEnemyPlayers(position, enemymask);
		uint256 total = DECIMALS;
		uint256 amount = total / numEnemies;
		for (uint8 i = 0; i < numEnemies; i++) {
			if (i == numEnemies - 1) {
				amount = total;
			}
			TOKENS.transfer(enemies[i], amount);
			total -= amount;
		}
	}

	function _updateNeighbours(
		uint64 position,
		uint32 period,
		Color oldColor,
		Color newColor
	) internal returns (int8 newDelta) {
		unchecked {
			int256 x = int256(int32(int256(uint256(position) & 0xFFFFFFFF)));
			int256 y = int256(int32(int256(uint256(position) >> 32)));
			uint64 upPosition = uint64((uint256(y - 1) << 32) + uint256(x));
			uint64 leftPosition = uint64((uint256(y) << 32) + uint256(x - 1));
			uint64 downPosition = uint64((uint256(y + 1) << 32) + uint256(x));
			uint64 rightPosition = uint64((uint256(y) << 32) + uint256(x + 1));

			newDelta =
				_updateCell(upPosition, period, 0, oldColor, newColor) +
				_updateCell(leftPosition, period, 1, oldColor, newColor) +
				_updateCell(downPosition, period, 2, oldColor, newColor) +
				_updateCell(rightPosition, period, 3, oldColor, newColor);	
		}
	}

	function _computeMove(
		address player,
		uint32 period,
		Move memory move
	) internal returns (uint256 tokensPlaced, uint256 invalidMove) {
		Cell memory currentState = _getUpdatedCell(move.position, period);

		if (currentState.periodWhenTokenIsAdded == period) {
			// COLLISION
			// you get your token back
			// the other player too
			if (currentState.life != 0) {
				_updateNeighbours(move.position, period, currentState.color, Color.None);

				// TODOI give token back to previous owner (currentState.owner)
				currentState.life = 0;
				currentState.color = Color.None;
				currentState.owner = address(0);
				currentState.lastPeriodUpdate = 0;
				currentState.delta = 0;
				currentState.enemymask = 0;
				cells[move.position] = currentState;
			}
		} else if (currentState.life == 0) {
			currentState.life = 1;
			currentState.owner = player;
			currentState.periodWhenTokenIsAdded = period;
			currentState.lastPeriodUpdate = period;

			if (currentState.color != move.color) {
				// only update neighbour if color changed
				_updateNeighbours(move.position, period, currentState.color, move.color);
				currentState.color = move.color;
				// TODO fetch neighbours to compute delta
				currentState.delta = 0;
				currentState.enemymask = 0;
			} else {
				// TODO fetch neighbours to compute delta
				currentState.delta = 0;
				currentState.enemymask = 0;
			}

			tokensPlaced = 1;
			cells[move.position] = currentState;
		} else {
			// invalid move
			invalidMove = 1;
		}
	}
}

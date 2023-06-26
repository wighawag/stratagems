// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721.sol';
import 'solidity-kit/solc_0.8/ERC165/interfaces/IERC165.sol';

interface IStratagemsCore {
	/// @notice The set of possible color (None indicate the Cell is empty)
	enum Color {
		None,
		Blue,
		Red,
		Green,
		Yellow
	}

	struct Cell {
		address owner;
		uint32 lastEpochUpdate;
		uint32 epochWhenTokenIsAdded;
		Color color;
		uint8 life;
		int8 delta;
		uint8 enemymask;
	}

	struct Commitment {
		bytes24 hash;
		uint32 epoch;
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

	struct TokenTransfer {
		address payable to;
		uint256 amount;
	}

	/// @notice A player has commited to make a move and resolve it on the resolution phase
	/// @param player account taking the staking risk (can be a different account than the one controlling the gems)
	/// @param epoch epoch number on which this commit belongs to
	/// @param commitmentHash the hash of moves
	event CommitmentMade(address indexed player, uint32 indexed epoch, bytes24 commitmentHash);

	/// @notice A player has canceled a previous commitment by burning some tokens
	/// @param player the account that made the commitment
	/// @param epoch epoch number on which this commit belongs to
	/// @param amountBurnt amount of token to burn
	/// @param furtherMoves hash of further moves, unless bytes32(0) which indicate end.
	event CommitmentVoid(address indexed player, uint32 indexed epoch, uint256 amountBurnt, bytes24 furtherMoves);

	/// @notice Player has resolved its previous commitment
	/// @param player account who commited
	/// @param epoch epoch number on which this commit belongs to
	/// @param commitmentHash the hash of the moves
	/// @param moves the moves
	/// @param furtherMoves hash of further moves, unless bytes32(0) which indicate end.
	event CommitmentResolved(
		address indexed player,
		uint32 indexed epoch,
		bytes24 indexed commitmentHash,
		Move[] moves,
		bytes24 furtherMoves
	);

	/// @notice Player have withdrawn token from the reserve
	/// @param player account withdrawing the tokens
	/// @param amountWithdrawn the number of tokens withdrawnn
	/// @param newAmount the number of tokens in reserver as a result
	event ReserveWithdrawn(address indexed player, uint256 amountWithdrawn, uint256 newAmount);

	/// @notice Player has deposited token in the reserve, allowing it to use that much in game
	/// @param player account receiving the token in the reserve
	/// @param amountDeposited the number of tokens deposited
	/// @param newAmount the number of tokens in reserver as a result
	event ReserveDeposited(address indexed player, uint256 amountDeposited, uint256 newAmount);

	/// @notice called by players to add tokens to their reserve
	/// @param tokensAmountToAdd amount of tokens to add
	/// @param permit permit EIP2612, .value = zero if not needed
	function addToReserve(uint256 tokensAmountToAdd, Permit calldata permit) external;

	/// @notice called by players to commit their moves
	///  this can be called multiple time, the last call overriding the previous.
	/// @param commitmentHash the hash of the moves
	function makeCommitment(bytes24 commitmentHash) external;

	/// @notice called to make a commitment along with tokens to add to the reserve
	/// @param commitmentHash the has of the moves
	/// @param tokensAmountToAdd amount of tokens to add to the reserve. the resulting total must be enough to cover the moves
	/// @param permit permit EIP2612, value = zero if not needed
	function makeCommitmentWithExtraReserve(
		bytes24 commitmentHash,
		uint256 tokensAmountToAdd,
		Permit calldata permit
	) external;

	/// @notice called by players to withdraw tokens from the reserve
	///  can only be called if no commitments are pending
	///  Note that while you can withdraw after commiting, note that if you do not have enough tokens
	///  you'll have your commitment failing.
	/// @param amount number of tokens to withdraw
	function withdrawFromReserve(uint256 amount) external;

	/// @notice called by player to resolve their commitment
	///  this is where the core logic of the game takes place
	///  This is where the game board evolves
	///  The game is designed so that resolution order do not matter
	/// @param player the account who committed the move
	/// @param secret the secret used to make the commit
	/// @param moves the actual moves
	/// @param furtherMoves if moves cannot be contained in one tx, further moves are represented by a hash to resolve too
	///  Note that you have to that number of mvoes
	function resolve(address player, bytes32 secret, Move[] calldata moves, bytes24 furtherMoves) external;

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
	) external;

	/// @notice should only be called as last resort
	/// this will burn all tokens in reserve
	/// If player has access to the secret, better call acknowledgeMissedResolution
	function acknowledgeMissedResolutionByBurningAllReserve() external;

	/// @notice poke a position, resolving its virtual state and if dead, reward neighboor enemies colors
	/// @param position the cell position
	function poke(uint64 position) external;

	/// poke and collect the tokens won
	/// @param positions cell positions to collect from
	function pokeMultiple(uint64[] calldata positions) external;
}

interface IStratagemsExta {
	/// @notice A descriptive name for a collection of NFTs in this contract
	function name() external view returns (string memory);

	/// @notice An abbreviated name for NFTs in this contract
	function symbol() external view returns (string memory);

	/// @notice A distinct Uniform Resource Identifier (URI) for a given asset.
	/// @dev Throws if `_tokenId` is not a valid NFT. URIs are defined in RFC
	///  3986. The URI may point to a JSON file that conforms to the "ERC721
	///  Metadata JSON Schema".
	function tokenURI(uint256 _tokenId) external view returns (string memory);
}

interface IStratagems is IStratagemsCore, IERC721, IStratagemsExta {}

// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721.sol';
import 'solidity-kit/solc_0.8/ERC165/interfaces/IERC165.sol';
import 'solidity-kit/solc_0.8/ERC20/ERC2612/interfaces/IERC20WithIERC2612.sol';

interface UsingStratagemsTypes {
	// --------------------------------------------------------------------------------------------
	// EXTERNAL TYPES
	// --------------------------------------------------------------------------------------------

	/// @notice The set of possible color (None indicate the Cell is empty)
	enum Color {
		None,
		Blue,
		Red,
		Green,
		Yellow,
		Purple,
		Evil
	}

	struct Move {
		uint64 position;
		Color color; // Color.None to indicate exit and Color.Evil is not allowed here
	}

	struct Permit {
		uint256 value;
		uint256 deadline;
		uint8 v;
		bytes32 r;
		bytes32 s;
	}

	struct Config {
		IERC20WithIERC2612 tokens;
		address payable burnAddress;
		uint256 startTime;
		uint256 commitPhaseDuration;
		uint256 resolutionPhaseDuration;
		uint8 maxLife;
		uint256 numTokensPerGems;
	}

	struct FullCell {
		address owner;
		uint32 lastEpochUpdate;
		uint32 epochWhenTokenIsAdded;
		Color color;
		uint8 life;
		int8 delta;
		uint8 enemymask;
	}

	// --------------------------------------------------------------------------------------------
	// STORAGE TYPES
	// --------------------------------------------------------------------------------------------
	struct Cell {
		uint32 lastEpochUpdate; // TODO uint24 is enough
		uint32 epochWhenTokenIsAdded; // TODO uint24 is enough
		Color color;
		uint8 life;
		int8 delta;
		uint8 enemymask; // rename to enemyMap
		uint8 distributionMap; // this encode who is left to be given reward
		// TODO could be encoded in "delta" or "enemymask" // but delta and enemymask could also be together
		// alternatively we could reuse enemymask
		// and reset it if token is revived (delta could also be recomputed on revival)
	}

	struct Commitment {
		bytes24 hash;
		uint32 epoch;
	}

	// --------------------------------------------------------------------------------------------
	// INTERNAL TYPES
	// --------------------------------------------------------------------------------------------

	struct TokenTransfer {
		address payable to;
		uint256 amount;
	}

	struct MoveTokens {
		uint256 tokensPlaced;
		uint256 tokensBurnt;
		uint256 tokensReturned;
	}
}

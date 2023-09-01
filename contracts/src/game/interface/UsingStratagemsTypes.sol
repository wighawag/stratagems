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
		uint64 position; // TODO make it bigger ? uint32 * uint32 is probably infinitely big enough
		Color color;
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
		uint24 lastEpochUpdate;
		uint24 epochWhenTokenIsAdded;
		Color color;
		uint8 life;
		int8 delta;
		uint8 enemyMap;
		uint8 distributionMap;
	}

	// --------------------------------------------------------------------------------------------
	// STORAGE TYPES
	// --------------------------------------------------------------------------------------------
	struct Cell {
		uint24 lastEpochUpdate;
		uint24 epochWhenTokenIsAdded;
		Color color;
		uint8 life;
		int8 delta;
		uint8 enemyMap;
		uint8 distributionMap; // this encode who is left to be given reward
		// TODO could be encoded in "delta" or "enemyMap" // but delta and enemyMap could also be together
		// alternatively we could reuse enemyMap
		// and reset it if token is revived (delta could also be recomputed on revival)
	}

	struct Commitment {
		bytes24 hash;
		uint24 epoch;
	}

	// --------------------------------------------------------------------------------------------
	// INTERNAL TYPES
	// --------------------------------------------------------------------------------------------

	struct TokenTransfer {
		address payable to;
		uint256 amount;
	}

	struct TokenTransferCollection {
		TokenTransfer[] transfers;
		uint256 numTransfers;
	}

	struct MoveTokens {
		uint256 tokensPlaced;
		uint256 tokensBurnt;
		uint256 tokensReturned;
	}
}

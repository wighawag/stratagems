// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import 'solidity-kit/solc_0.8/ERC721/interfaces/IERC721.sol';
import 'solidity-kit/solc_0.8/ERC165/interfaces/IERC165.sol';
import 'solidity-kit/solc_0.8/ERC20/ERC2612/interfaces/IERC20WithIERC2612.sol';

interface StratagemsTypes {
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

	struct Config {
		IERC20WithIERC2612 tokens;
		address payable burnAddress;
		uint256 startTime;
		uint256 commitPhaseDuration;
		uint256 resolutionPhaseDuration;
		uint8 maxLife;
		uint256 numTokensPerGems;
	}
}

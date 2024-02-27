// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721.sol";
import "solidity-kit/solc_0_8/ERC165/interfaces/IERC165.sol";
import "solidity-kit/solc_0_8/ERC20/ERC2612/interfaces/IERC20WithIERC2612.sol";
import "solidity-kit/solc_0_8/debug/time/interfaces/ITime.sol";
import "../../token/interface/IOnStakeChange.sol";

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

    /// @notice Move struct that define position and color
    struct Move {
        uint64 position; // TODO make it bigger ? uint32 * uint32 is probably infinitely big enough
        Color color;
    }

    /// @notice Permit struct to authorize EIP2612 ERC20 contracts
    struct Permit {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Config struct to configure the game instance
    struct Config {
        IERC20WithIERC2612 tokens;
        address payable burnAddress;
        uint256 startTime;
        uint256 commitPhaseDuration;
        uint256 revealPhaseDuration;
        uint8 maxLife;
        uint256 numTokensPerGems;
        ITime time;
        IOnStakeChange generator;
    }

    /// @notice Cell struct representing the current state of a cell
    struct FullCell {
        address owner;
        uint24 lastEpochUpdate;
        uint24 epochWhenTokenIsAdded;
        uint24 producingEpochs;
        Color color;
        uint8 life;
        int8 delta;
        uint8 enemyMap;
        uint8 distribution;
        uint8 stake; // for Evil, else always 1
    }

    // --------------------------------------------------------------------------------------------
    // STORAGE TYPES
    // --------------------------------------------------------------------------------------------

    struct Discovered {
        uint32 minX;
        uint32 maxX;
        uint32 minY;
        uint32 maxY;
    }

    struct Cell {
        uint24 lastEpochUpdate;
        uint24 epochWhenTokenIsAdded;
        uint24 producingEpochs;
        Color color;
        uint8 life;
        int8 delta;
        uint8 enemyMap;
        uint8 distribution; // this encode who is left to be given reward (4 left most bits) and the reard (4 most right bits)
        uint8 stake; // for Evil, else always 1
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

    struct DisplayData {
        string x;
        string y;
        string life;
        string delta;
        string creationEpoch;
        string factionName;
        string factionColor;
    }
}

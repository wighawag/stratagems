// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721.sol";
import "solidity-kit/solc_0_8/ERC165/interfaces/IERC165.sol";
import "solidity-kit/solc_0_8/ERC20/interfaces/IERC20.sol";
import "solidity-kit/solc_0_8/debug/time/interfaces/ITime.sol";
import "../../token/interface/IOnStakeChange.sol";
import {UsingCommitRevealTypes} from "../../commit-reveal/interfaces/UsingCommitRevealTypes.sol";

/// @dev The game's types on top of the commit-reveal base's (`Cycle`,
///      `Commitment`, `Attendance`, `CyclePolicy`), which this inherits so the
///      game's ABI names them unqualified.
interface UsingStratagemsTypes is UsingCommitRevealTypes {
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
        Color color;
    }

    struct Config {
        IERC20 tokens;
        address payable burnAddress;
        uint256 startTime;
        uint256 commitPhaseDuration;
        uint256 revealPhaseDuration;
        uint8 maxLife;
        uint256 numTokensPerGems;
        ITime time;
        IOnStakeChange generator;
        uint256 actionsPerReveal;
        CyclePolicy cyclePolicy;
    }

    struct FullCell {
        address owner;
        uint24 lastCycleUpdate;
        uint24 cycleWhenTokenIsAdded;
        uint24 producingCycles;
        Color color;
        uint8 life;
        int8 delta;
        uint8 enemyMap;
        uint8 distribution;
        uint8 stake; // for Evil, else always 1
    }

    struct Cell {
        uint24 lastCycleUpdate;
        uint24 cycleWhenTokenIsAdded;
        uint24 producingCycles;
        Color color;
        uint8 life;
        int8 delta;
        uint8 enemyMap;
        uint8 distribution; // this encode who is left to be given reward (4 left most bits) and the reard (4 most right bits)
        uint8 stake; // for Evil, else always 1
    }

    /// @notice A cell as it stood before the first move on it in `cycle`.
    /// @dev THE BOARD A MOVE IS JUDGED AGAINST. Reveals arrive in whatever
    ///      order the mempool delivers them, so whether a move is allowed, and
    ///      who a payout goes to, is read from the cell as it was before any
    ///      reveal of the cycle touched it, never from the current board.
    ///      Written by the first move on the cell in a cycle; until then the
    ///      current record is that state (a neighbour's move cannot change a
    ///      cell's life at the current cycle, nor its owner).
    struct CellAtCycleStart {
        address owner;
        uint24 cycle;
        uint8 life;
    }

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
        uint256 tokensReturned;
    }

    struct DisplayData {
        string x;
        string y;
        string life;
        string delta;
        string creationCycle;
        string factionName;
        string factionColor;
    }
}

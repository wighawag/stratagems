// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721Metadata.sol";
import "solidity-kit/solc_0_8/ERC165/interfaces/IERC165.sol";
import {IDelegation} from "@etherplay/delegation/contracts/IDelegation.sol";
import "./UsingStratagemsTypes.sol";
import "./UsingStratagemsEvents.sol";
import "./UsingStratagemsErrors.sol";

interface IStratagemsGetters is UsingStratagemsTypes, UsingStratagemsEvents, UsingStratagemsErrors {
    /// @notice the cell at the current cycle (its life computed from its last update)
    function getCell(uint256 id) external view returns (FullCell memory cell);

    /// @notice the cells at the current cycle
    function getCells(uint256[] memory ids) external view returns (FullCell[] memory cells);

    /// @notice the tokens `player` holds in the game's reserve (a bond included)
    function getReserve(uint256 player) external view returns (uint256 amount);

    /// @notice the commitment of `player`: its head, its cycle (zero: none) and its bond
    function getCommitment(uint256 player) external view returns (Commitment memory commitment);

    function getConfig() external view returns (Config memory config);

    function getCycleNumber() external view returns (uint64 cycleNumber, bool commiting);

    function getCycle() external view returns (Cycle memory cycle);

    function getAttendance() external view returns (Attendance memory attendance);
}

interface IStratagemsCommit is UsingStratagemsTypes, UsingStratagemsEvents, UsingStratagemsErrors {
    /// @notice add tokens to the reserve of `player`, from the caller's wallet
    function addToReserve(uint256 player, uint256 tokensAmountToAdd) external;

    /// @notice the same, and forward `msg.value` to `stipendTo`: one transaction that stakes for `player`
    ///         and pays the gas of the key that will play for them (the template's acquisition rail)
    /// @param stipendTo where `msg.value` goes; zero only when nothing is sent
    function addToReserveAndFund(uint256 player, uint256 tokensAmountToAdd, address payable stipendTo) external payable;

    /// @notice commit `player` (resolved through delegation) to a turn, bonding part of their reserve
    /// @param payee an address paid `msg.value`, for a service that reveals on the player's behalf
    function makeCommitment(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond,
        address payable payee
    ) external payable;

    /// @notice the same, after adding `tokensAmountToAdd` from the caller's wallet: one transaction
    function makeCommitmentWithExtraReserve(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond,
        uint256 tokensAmountToAdd,
        address payable payee
    ) external payable;

    /// @notice take a commitment back while its commit phase is open
    function cancelCommitment(uint256 player) external;

    /// @notice withdraw from the caller's reserve what no commitment bonds
    function withdrawFromReserve(uint256 amount) external;
}

interface IStratagemsReveal is UsingStratagemsTypes, UsingStratagemsEvents, UsingStratagemsErrors {
    /// @notice reveal one chunk of `player`'s commitment; anyone may send it
    /// @param furtherActions the hash of the next chunk, zero for the last
    function reveal(
        uint256 player,
        Move[] calldata moves,
        bytes32 secret,
        bytes24 furtherActions,
        address payable payee
    ) external payable;

    /// @notice settle a missed reveal shown its chunk: one gem per committed move is burnt, the rest of
    ///         the bond is released with the last chunk; anyone may send it
    function acknowledgeMissedReveal(
        uint256 player,
        Move[] calldata moves,
        bytes32 secret,
        bytes24 furtherActions
    ) external;

    /// @notice settle a missed reveal without its chunks: the whole remaining bond is burnt;
    ///         only the player or their delegate
    function forfeitMissedReveal(uint256 player) external;

    /// @notice move the cycle on where the policy allows it (never under `Timed`)
    function advanceCycle() external returns (uint64 cycleNumber, bool commiting);
}

interface IStratagemsPoke is UsingStratagemsTypes, UsingStratagemsEvents {
    function poke(uint64 position) external;

    function pokeMultiple(uint64[] calldata positions) external;
}

interface IStratagems is
    IStratagemsCommit,
    IStratagemsReveal,
    IStratagemsPoke,
    IStratagemsGetters,
    IDelegation,
    IERC721,
    IERC721Metadata
{}

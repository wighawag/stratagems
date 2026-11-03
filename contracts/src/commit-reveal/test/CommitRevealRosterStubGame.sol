// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import {Delegation} from "@etherplay/delegation/contracts/Delegation.sol";
import {UsingCommitReveal} from "../UsingCommitReveal.sol";
import {CommitReveal} from "../CommitReveal.sol";

/// @title A game with a closed roster on the commit-reveal base, for its tests
/// @notice NOT DEPLOYED BY ANYTHING. The smallest game that exercises a
///         roster: a reserve with no token, an empty turn, and the roster's
///         routes. A contract of its own rather than more routes on
///         {CommitRevealStubGame}, which is already close to the code size
///         limit. `test/js/CommitRevealRoster.test.ts` drives it.
///
///         Only {registerDelegate} of the delegation routes, rather than all
///         of `UsingDelegation`: the roster's tests need a delegate and
///         nothing else of them, and this stub is compiled unoptimised, at
///         the code size limit since the end was added.
contract CommitRevealRosterStubGame is UsingCommitReveal {
    struct Order {
        uint8 kind;
        uint64 quantity;
    }

    constructor(CommitRevealConfig memory config) UsingCommitReveal(config) {}

    /// @notice Authorise `delegate` to act for the caller (no payment: the
    ///         second argument is kept so the call matches `UsingDelegation`'s).
    function registerDelegate(address delegate, address) external {
        Delegation.register(msg.sender, delegate);
    }

    /// @notice A stub has no token: a deposit is credited for nothing.
    function deposit(uint256 player, uint256 amount) external {
        _addToReserve(player, amount);
    }

    function withdraw(uint256 amount) external {
        _withdrawFromReserve(uint256(uint160(msg.sender)), amount);
    }

    function openRoster(
        address creator,
        uint8 seats,
        uint16 cycles,
        bytes32 options
    ) external {
        _openRoster(creator, seats, cycles, options);
    }

    function forfeitMissedReveal(uint256 player) external {
        _forfeitMissedReveal(msg.sender, player);
    }

    function getEnd()
        external
        view
        returns (uint64 cycleNumber, uint64 lastCycleNumber, bool ended)
    {
        (cycleNumber, ) = _cycleNumber();
        lastCycleNumber = _lastCycleNumber();
        ended = lastCycleNumber != 0 && cycleNumber > lastCycleNumber;
    }

    function getGameOptions() external view returns (bytes32) {
        return _gameOptions();
    }

    function startGame() external returns (uint64 cycleNumber) {
        return _startGame(msg.sender);
    }

    function forfeitMember(uint256 player) external {
        _forfeitMember(msg.sender, player);
    }

    function makeCommitment(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond
    ) external {
        _makeCommitment(_playerOf(msg.sender, player), commitmentHash, bond);
    }

    function reveal(
        uint256 player,
        Order[] calldata orders,
        bytes32 secret,
        bytes24 furtherActions
    ) external {
        CommitReveal.Chunk memory chunk = _openChunk(
            player,
            bytes24(keccak256(abi.encode(secret, orders, furtherActions))),
            orders.length,
            furtherActions
        );
        _closeChunk(chunk, 0);
    }

    function advanceCycle()
        external
        returns (uint64 cycleNumber, bool commiting)
    {
        return _advanceCycle();
    }

    function getRoster()
        external
        view
        returns (Roster memory roster, uint256[] memory members)
    {
        return (_roster(), _members());
    }

    function getReserve(uint256 player) external view returns (uint256) {
        return _reserveOf(player);
    }

    function getCommitment(
        uint256 player
    ) external view returns (Commitment memory) {
        return _commitmentOf(player);
    }

    function getCycle() external view returns (Cycle memory) {
        return _cycle();
    }

    function getAttendance() external view returns (Attendance memory) {
        (uint64 cycleNumber, ) = _cycleNumber();
        return _attendance(cycleNumber);
    }
}

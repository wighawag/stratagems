// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import {UsingDelegation} from "@etherplay/delegation/contracts/UsingDelegation.sol";
import {UsingCommitReveal} from "../UsingCommitReveal.sol";
import {CommitReveal} from "../CommitReveal.sol";

/// @title A second game on the commit-reveal base, for its tests
/// @notice NOT DEPLOYED BY ANYTHING. It exists so that the base is tested by a
///         game that is not the reference one: another action type, a cost
///         that depends on what each action is, a penalty that is not the
///         cost, one contract rather than routes, and no token at all.
/// @dev If the base only worked for the reference game's shape, this is where
///      it would stop compiling or stop passing. `test/js/CommitRevealBase.test.ts`
///      drives it.
contract CommitRevealStubGame is UsingCommitReveal, UsingDelegation {
    /// @notice This game's action: an order for some quantity of a kind.
    struct Order {
        uint8 kind;
        uint64 quantity;
    }

    event Ordered(uint256 indexed player, uint8 indexed kind, uint64 quantity);

    /// @notice what one unit of an order costs, so an action's cost depends on
    ///         the action
    uint256 public immutable UNIT_COST;
    /// @notice what each order of a missed reveal forfeits, whatever it was
    uint256 public immutable PENALTY_PER_ORDER;

    /// @notice the board: accumulated quantity per kind, so reveals commute
    mapping(uint8 kind => uint256 quantity) public totalOf;

    constructor(
        CommitRevealConfig memory config,
        uint256 unitCost,
        uint256 penaltyPerOrder
    ) UsingCommitReveal(config) {
        UNIT_COST = unitCost;
        PENALTY_PER_ORDER = penaltyPerOrder;
    }

    /// @notice A stub has no token: a deposit is credited for nothing.
    function deposit(uint256 player, uint256 amount) external {
        _addToReserve(player, amount);
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
            digest(orders, secret, furtherActions),
            orders.length,
            furtherActions
        );
        uint256 cost = 0;
        for (uint256 i = 0; i < orders.length; i++) {
            totalOf[orders[i].kind] += orders[i].quantity;
            cost += uint256(orders[i].quantity) * UNIT_COST;
            emit Ordered(player, orders[i].kind, orders[i].quantity);
        }
        _closeChunk(chunk, cost);
    }

    /// @notice THE MISUSE, on purpose: a chunk opened and never closed. What
    ///         the tests pin is that it cannot pass for a reveal.
    function revealWithoutClosing(
        uint256 player,
        Order[] calldata orders,
        bytes32 secret,
        bytes24 furtherActions
    ) external {
        _openChunk(
            player,
            digest(orders, secret, furtherActions),
            orders.length,
            furtherActions
        );
        for (uint256 i = 0; i < orders.length; i++) {
            totalOf[orders[i].kind] += orders[i].quantity;
        }
    }

    function acknowledgeMissedReveal(
        uint256 player,
        Order[] calldata orders,
        bytes32 secret,
        bytes24 furtherActions
    ) external {
        CommitReveal.Chunk memory chunk = _openMissedChunk(
            player,
            digest(orders, secret, furtherActions),
            orders.length,
            furtherActions
        );
        _closeChunk(chunk, orders.length * PENALTY_PER_ORDER);
    }

    function forfeitMissedReveal(uint256 player) external {
        _forfeitMissedReveal(msg.sender, player);
    }

    function advanceCycle()
        external
        returns (uint64 cycleNumber, bool commiting)
    {
        return _advanceCycle();
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

    /// @notice The one encoding, over this game's action type.
    function digest(
        Order[] calldata orders,
        bytes32 secret,
        bytes24 furtherActions
    ) public pure returns (bytes24) {
        return bytes24(keccak256(abi.encode(secret, orders, furtherActions)));
    }
}

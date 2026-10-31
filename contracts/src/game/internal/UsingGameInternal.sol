// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./UsingGameStore.sol";
import "../interfaces/UsingGameEvents.sol";
import "../interfaces/UsingGameErrors.sol";
import "../../utils/PositionUtils.sol";
import {CommitReveal} from "../../commit-reveal/CommitReveal.sol";

/// @dev THIS GAME, ON THE COMMIT-REVEAL BASE. Everything that is mechanism -
///      the reserve, the bonded commitment, the chain of chunks, the cycle
///      policies, advance, attendance, delegation and both settlements - is
///      {UsingCommitReveal}'s (`src/commit-reveal/`), which this game keeps
///      rather than writes. What is left is what a placement IS: its type, its
///      cost, what it does to a cell, and the hash it is committed under.
abstract contract UsingGameInternal is
    UsingGameStore,
    UsingGameEvents,
    UsingGameErrors
{
    constructor(Config memory config) UsingGameStore(config) {}

    /// @notice Apply one chunk of a player's revealed placements to the board.
    /// @param furtherActions The hash of the next chunk, or zero if this is the
    ///        last. A commitment is the HEAD OF A HASH CHAIN: each reveal opens
    ///        one chunk and rewrites the head to the next, and the commitment
    ///        stays open until a chunk arrives declaring none.
    /// @dev THE BASE CHECKS AND CHARGES, THE GAME RESOLVES. {_openChunk}
    ///      refuses a chunk that is not the head of the chain or has an
    ///      unlawful length, before anything is placed; {_closeChunk} takes
    ///      what the placements cost from the bond, moves the chain on, and
    ///      counts the turn once its last chunk lands.
    ///
    /// @dev ORDER INDEPENDENCE. Everything this does to a cell must commute
    ///      with what any other player's reveal does to it in the same cycle,
    ///      because reveals arrive in whatever order the mempool delivers them
    ///      and the final board must not depend on that. Concretely: accumulate
    ///      (`+=`), never branch on another player's state.
    ///
    ///      Rules like "the first to reveal takes the cell" or "reject a cell
    ///      that is already taken" look harmless and are not: they hand the
    ///      outcome to whoever pays the most gas, which is the very thing
    ///      committing was supposed to prevent. Cells are shared here; two
    ///      players placing on the same cell both hold a share of it.
    function _reveal(
        uint256 player,
        Placement[] calldata placements,
        bytes32 secret,
        bytes24 furtherActions
    ) internal {
        CommitReveal.Chunk memory chunk = _openChunk(
            player,
            _digest(placements, secret, furtherActions),
            placements.length,
            furtherActions
        );

        uint256 numActions = placements.length;
        for (uint256 i = 0; i < numActions; i++) {
            _place(player, placements[i].cellID);
        }

        _closeChunk(chunk, numActions * PLACEMENT_COST);
    }

    /// @notice Settle one chunk of a missed reveal, shown its placements.
    /// @dev THE PENALTY IS WHAT THE PLACEMENTS WOULD HAVE COST, which is this
    ///      game's answer to the base's question and is exactly what revealing
    ///      them would have spent: going silent buys nothing over revealing.
    ///      The placements are NOT applied - the cycle they were for is over -
    ///      and whatever the bond held beyond the turn's cost goes back to the
    ///      player with the last chunk. So the client may bond a whole number
    ///      of chunks, which hides how many placements the turn holds, without
    ///      a missed reveal costing more than the turn would have.
    function _acknowledgeMissedReveal(
        uint256 player,
        Placement[] calldata placements,
        bytes32 secret,
        bytes24 furtherActions
    ) internal {
        CommitReveal.Chunk memory chunk = _openMissedChunk(
            player,
            _digest(placements, secret, furtherActions),
            placements.length,
            furtherActions
        );
        _closeChunk(chunk, placements.length * PLACEMENT_COST);
    }

    /// @dev LOAD, A PURE CORE, APPLY. The rule of a placement is
    ///      {_placementOutcome}, a pure function of the cell as this player sees
    ///      it; this loads that from storage and {_applyPlacement} writes back
    ///      what the rule returns. The split is what lets a client run the SAME
    ///      rule, in the deployment's own bytecode, through the simulation route
    ///      ({IGameSimulation}) before anything is committed, rather than keeping
    ///      a copy of it in TypeScript that can drift from this one.
    ///
    ///      Pure accumulation. No player's outcome depends on what another
    ///      player's reveal did this cycle, so it commutes. See _reveal.
    function _place(uint256 player, uint64 cellID) internal {
        PlayerCell memory before = _loadPlayerCell(player, cellID);
        _applyPlacement(
            player,
            before,
            _placementOutcome(before, PLACEMENT_COST)
        );
    }

    /// @notice What one placement does to a cell: THE RULE OF THIS GAME.
    /// @dev Pure, and it must stay so: the simulation route runs it with no
    ///      storage behind it. The cost is a parameter rather than the
    ///      immutable because a pure function may not read one; both callers
    ///      pass the deployment's {PLACEMENT_COST}.
    ///
    ///      It only ever ADDS, which is the order-independence rule in its
    ///      smallest form: a stake and a claimant count reached by accumulation
    ///      are the same whichever reveal of the cycle lands first.
    function _placementOutcome(
        PlayerCell memory before,
        uint256 placementCost
    ) internal pure returns (PlayerCell memory outcome) {
        outcome = PlayerCell({
            cellID: before.cellID,
            totalStake: before.totalStake + placementCost,
            numClaimants: before.playerStake == 0
                ? before.numClaimants + 1
                : before.numClaimants,
            playerStake: before.playerStake + placementCost
        });
    }

    /// @dev The cell as `player`'s placement sees it, from storage.
    function _loadPlayerCell(
        uint256 player,
        uint64 cellID
    ) internal view returns (PlayerCell memory) {
        Cell storage cell = _cells[cellID];
        return
            PlayerCell({
                cellID: cellID,
                totalStake: cell.totalStake,
                numClaimants: cell.numClaimants,
                playerStake: _stakeOnCellBy[cellID][player]
            });
    }

    /// @dev Writes what {_placementOutcome} decided, and does the two things a
    ///      placement does that are not the rule: the zone index and the event.
    function _applyPlacement(
        uint256 player,
        PlayerCell memory before,
        PlayerCell memory outcome
    ) internal {
        uint64 cellID = before.cellID;

        if (before.numClaimants == 0) {
            // First claim this cell has ever had: index it under its zone, so
            // reading a viewport costs what the board holds (see
            // _cellsInZones) instead of walking 256 slots per zone.
            //
            // This branch READS SHARED STATE - another player's reveal in this
            // same cycle may have claimed the cell first - which the
            // order-independence rule normally forbids. It is sound here, and
            // the reason is worth being precise about rather than trusting:
            // the rule exists so that no player's OUTCOME depends on the order
            // reveals arrive in, and nothing observable to a player changes
            // here. The cell is appended exactly once whoever arrives first,
            // every stake still accumulates, and the client keys the result by
            // cellID. What does differ with order is the POSITION of the entry
            // in the array, and which of the two reveals pays for the append.
            // Neither is part of the game.
            //
            // It is HERE, in apply, and not in the rule, for the same reason:
            // it is bookkeeping for readers, not a consequence of the move, so
            // the simulation has nothing to say about it.
            //
            // Guarded on numClaimants rather than totalStake so it stays
            // correct for a game configured with a zero placement cost, where
            // an occupied cell can still have a total stake of zero.
            _occupiedCellsInZone[PositionUtils.getZone(cellID)].push(cellID);
        }

        Cell storage cell = _cells[cellID];
        cell.totalStake = outcome.totalStake;
        if (outcome.numClaimants != before.numClaimants) {
            cell.numClaimants = outcome.numClaimants;
        }
        _stakeOnCellBy[cellID][player] = outcome.playerStake;

        emit Placed(player, cellID, outcome.playerStake - before.playerStake);
    }

    /// @notice The hash a chunk of placements is committed under.
    /// @dev ONE ENCODING, ALWAYS, including for the last chunk of a turn, where
    ///      `furtherActions` is zero and is hashed in anyway. The design this is
    ///      ported from uses TWO - it drops the trailing field on the final
    ///      chunk - and both are sound against forgery. The reason to take the
    ///      single form is on the CLIENT's side: the hash the client builds has
    ///      to match this byte for byte, a mismatch is not a compile error and
    ///      not a failed read (the commit succeeds and the reveal reverts once
    ///      the stake is already bonded), and a second encoding selected by a
    ///      branch on the very value that distinguishes the last chunk from the
    ///      rest is a second chance to get that wrong. It is also the encoding
    ///      the commit-reveal base documents for every game.
    function _digest(
        Placement[] calldata placements,
        bytes32 secret,
        bytes24 furtherActions
    ) internal pure returns (bytes24) {
        return
            bytes24(keccak256(abi.encode(secret, placements, furtherActions)));
    }
}

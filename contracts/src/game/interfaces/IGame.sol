// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

// The delegation surface is NOT restated here. It is composed from the
// interface that ships beside the implementation in the etherplay delegation
// package, so the router's selector list and the library cannot drift: a
// restatement is a copy, and the failure it produces is a selector that routes
// nowhere, which reads to a player as a broken wallet rather than as a missing
// feature.
import {IDelegation} from "@etherplay/delegation/contracts/IDelegation.sol";

import "./UsingGameTypes.sol";
import "./UsingGameEvents.sol";
import "./UsingGameErrors.sol";

/// @dev EVERY `player` HERE IS A `uint256`, and it is the identity rather than
///      an account: what this game means by a player is decided in exactly one
///      place, {UsingCommitReveal-_playerOf}. On this game it is the account
///      widened, because the template is deliberately an address game; on a
///      game that keys by an avatar, a character or an empire it is that
///      token's id, and nothing in this interface changes. See
///      `web/src/lib/game/identity.ts` for the client's half of the same rule.
interface IGameCommit is UsingGameTypes {
    /// @notice Top up the reserve a player is willing to risk.
    /// @dev Takes `player` rather than crediting msg.sender, so that the stake
    ///      can be paid from the wallet holding the funds while the game is
    ///      played by a local signing key that holds none. Anyone may top up
    ///      anyone; only the owner can withdraw.
    function addToReserve(uint256 player, uint256 amount) external;

    /// @notice Take tokens back out. What is bonded to an open commitment stays.
    /// @dev Deliberately NOT delegable, and the only account-facing function
    ///      here that is not. A delegate is a key held in one browser so that
    ///      moves need no prompt; letting it take the stake OUT would hand
    ///      whatever got hold of that key the player's money. It may spend the
    ///      reserve on playing, which is what it is for, and it may never
    ///      withdraw it. Sent by the owner, so it prompts, which is right for
    ///      the one action that moves money to a person.
    function withdrawFromReserve(uint256 amount) external;

    /// @notice Commit to placements for this cycle, bonding part of the reserve.
    /// @param player The identity the commitment is FOR. Pass zero to play as
    ///        the caller. Anything else must be an identity the caller may act
    ///        for, which is how a local signer commits for the player without
    ///        holding their stake.
    /// @dev Authority and identity are separate here, and only the FIRST is
    ///      checked: the caller must be allowed to act for `player`. Compare
    ///      {reveal}, which checks nothing, because a reveal is validated by
    ///      the commitment hash rather than by who submits it.
    function makeCommitment(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond,
        address payable payee
    ) external payable;

    /// @notice Withdraw a commitment before the reveal phase begins.
    /// @param player The identity whose commitment it is; zero for the caller.
    ///        Delegable for the same reason committing is: the browser that
    ///        made it is the one that knows it should go.
    function cancelCommitment(uint256 player) external;
}

interface IGameReveal is UsingGameTypes {
    /// @notice Reveal one chunk of what a player committed to, and apply it.
    /// @param furtherActions The hash of the next chunk of this turn, or zero if
    ///        this reveal completes it. A TURN MAY BE BIGGER THAN A TRANSACTION:
    ///        the commitment is the head of a hash chain, each call opens one
    ///        chunk and rewrites the head, and the commitment stays open until a
    ///        chunk arrives declaring no further actions. A chunk may carry at
    ///        most {Config-actionsPerReveal} actions, and one that promises a
    ///        successor must carry exactly that many.
    /// @dev Takes `player` rather than using msg.sender so that anyone can
    ///      reveal for them: a player who is offline when the reveal phase
    ///      opens should not automatically forfeit.
    ///
    ///      A CALLER RESUMES FROM THE CHAIN, NOT FROM MEMORY. Which chunk is due
    ///      next is whatever {IGameGetters-getCommitment} currently reports as
    ///      the head, so a client interrupted halfway through a turn reads where
    ///      it got to rather than remembering it.
    function reveal(
        uint256 player,
        Placement[] calldata placements,
        bytes32 secret,
        bytes24 furtherActions,
        address payable payee
    ) external payable;

    /// @notice Settle one chunk of a missed reveal by showing it: the game's
    ///         penalty for those placements is forfeited, and with the last
    ///         chunk whatever the bond held beyond it goes back to the player.
    /// @dev ANYONE MAY CALL IT, with the same arguments a reveal takes: the
    ///      chain checks the chunk against the head exactly as a reveal does,
    ///      so it can only ever cost the player what those placements would
    ///      have cost, and nothing goes to the caller. A turn of several chunks
    ///      is settled in as many calls, from wherever the head got to. Refused
    ///      while the commitment's own cycle is still in progress: that is a
    ///      reveal, not a settlement.
    ///
    ///      WHY IT TAKES THE CHUNKS. A bond may exceed what the turn costs,
    ///      because a bond equal to the exact cost tells every observer how many
    ///      placements the commitment hides. Without the chunks the contract
    ///      cannot tell the surplus from the stake. See {forfeitMissedReveal}
    ///      for the settlement that is not shown them.
    function acknowledgeMissedReveal(
        uint256 player,
        Placement[] calldata placements,
        bytes32 secret,
        bytes24 furtherActions
    ) external;

    /// @notice Settle a missed reveal WITHOUT its chunks, forfeiting the whole
    ///         bond still earmarked for it.
    /// @param player The identity whose commitment it is; zero for the caller.
    /// @dev ONLY THE PLAYER OR THEIR DELEGATE: a stranger could otherwise take
    ///      a surplus the player could have recovered by settling with the
    ///      chunks. It is the route for a player who no longer has their plan,
    ///      and it always works: it needs nothing but the identity.
    function forfeitMissedReveal(uint256 player) external;

    /// @notice Move the cycle on, if the rules already permit it.
    /// @return cycleNumber The cycle after the move.
    /// @return commiting Which phase it is now in.
    /// @dev PERMISSIONLESS AND STRICTLY CONDITIONAL. Anyone may call it, and it
    ///      can only do what would already have been allowed: the phase moves
    ///      when every member the cycle waits for has committed, and the cycle
    ///      moves when every commitment in it has been revealed. So there is
    ///      nothing here to grant and nothing to abuse, and an advance that is
    ///      not yet due reverts saying who is still being waited for.
    ///
    ///      IT IS ITS OWN TRANSACTION AND NEVER A RIDER ON THE LAST REVEAL,
    ///      which is what keeps `reveal` meaning the same thing whoever sends
    ///      it and whenever it lands. See {UsingCommitReveal-_advanceCycle}.
    ///
    ///      On a purely timed game it always reverts, because the cycle is
    ///      whatever the clock says and no transaction can change that.
    function advanceCycle()
        external
        returns (uint64 cycleNumber, bool commiting);
}

interface IGameGetters is UsingGameTypes {
    function getCycleNumber()
        external
        view
        returns (uint64 cycleNumber, bool commiting);

    /// @notice Where the cycle is, and until when.
    /// @dev THE ONE A CLIENT SHOULD READ. A client can compute the cycle from
    ///      the clock and the deployment's durations, and under a policy that
    ///      allows early advance that computation is a FLOOR rather than an
    ///      answer: an advance is a transaction, and no amount of arithmetic
    ///      predicts one. Reading this and predicting forward from it is the
    ///      shape that stays correct under all three policies.
    function getCycle() external view returns (Cycle memory cycle);

    /// @notice Who the cycle is waiting for, and how many have acted.
    function getAttendance()
        external
        view
        returns (Attendance memory attendance);

    function getCommitment(
        uint256 player
    ) external view returns (Commitment memory commitment);

    function getReserve(uint256 player) external view returns (uint256 amount);

    function getConfig() external view returns (Config memory config);

    /// @notice One cell.
    function getCell(uint64 cellID) external view returns (Cell memory cell);

    /// @notice What a specific player holds on a cell.
    function getStakeOnCell(
        uint64 cellID,
        uint256 player
    ) external view returns (uint256 stake);

    /// @notice Every non-empty cell in a zone, plus the cycle the answer is for.
    /// @dev The cycle is returned so a caller can tell a current answer from a
    ///      stale one without a second call.
    function getCellsInZone(
        uint64 zone
    ) external view returns (CellAt[] memory cells, uint64 cycleNumber);

    /// @notice The same across several zones, for a viewport spanning them.
    function getCellsInZones(
        uint64[] calldata zones
    ) external view returns (CellAt[] memory cells, uint64 cycleNumber);
}

interface IGameSimulation is UsingGameTypes {
    /// @notice What a turn would do to the cells it touches, by the rule a
    ///         reveal applies, and with nothing written.
    /// @param cells Every cell the placements name, as the PLAYER sees it: what
    ///        the cell holds and what this player holds on it (`getCell` and
    ///        `getStakeOnCell`). Any order, each once.
    /// @param placements The turn, in the order it would be revealed.
    /// @return outcome The same cells, in the same order, after the turn.
    /// @dev Reads no storage, so the answer is about the cells it is given and
    ///      not about the board: a client runs it from the deployed bytecode in
    ///      its own sandbox. Reverts {CellNotGiven} for a placement on a cell
    ///      missing from `cells`, rather than treating it as empty.
    ///
    ///      It is one player's turn on its own, and that is all a preview CAN
    ///      be: the other players' turns this cycle are committed, not known.
    function resolvePlacements(
        PlayerCell[] calldata cells,
        Placement[] calldata placements
    ) external view returns (PlayerCell[] memory outcome);
}

interface IGame is
    IGameCommit,
    IGameReveal,
    IGameGetters,
    IGameSimulation,
    IDelegation
{}

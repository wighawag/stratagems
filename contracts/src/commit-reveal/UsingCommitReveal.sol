// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import {ITime} from "solidity-kit/solc_0_8/debug/time/interfaces/ITime.sol";
import {Delegation} from "@etherplay/delegation/contracts/Delegation.sol";
import {UsingCommitRevealEvents} from "./interfaces/UsingCommitRevealEvents.sol";
import {UsingCommitRevealErrors} from "./interfaces/UsingCommitRevealErrors.sol";
import {CommitReveal} from "./CommitReveal.sol";

/// @title UsingCommitReveal
/// @notice The {CommitReveal} library, wired to its configuration and to the
///         three seams a game varies at. What a game inherits to be a
///         commit-reveal game, and the reason it does not write one.
///
/// THE CONFIGURATION IS IMMUTABLE, so the hot path reads no storage for it:
/// the chunk size, the phase durations and the policy are compiled into each
/// route's bytecode by its constructor. Every route behind a router is built
/// with the same config, which is what the deploy script is for.
///
/// THREE SEAMS, AND NOTHING ELSE HERE IS VIRTUAL. {_playerOf} decides who the
/// caller acts for (an account through delegation by default, a token in a
/// custody game). {_forfeit} decides what a missed reveal costs (the bond out
/// of the reserve by default, custody of a token elsewhere). {_cycle} decides
/// where the cycle is (the three policies by default). A game overrides one
/// function per axis and touches no store and no other internal.
///
/// A GAME'S ACTIONS NEVER COME IN. A game keeps its own typed routes, hashes
/// its own action type in the one encoding
/// `bytes24(keccak256(abi.encode(secret, actions, furtherActions)))`, and
/// calls {_openChunk} with the digest and the count, resolves its actions,
/// then calls {_closeChunk} with what they cost. The settlement of a missed
/// reveal shown the chunks is the same pair, opened with {_openMissedChunk}
/// and closed with the game's penalty.
abstract contract UsingCommitReveal is
    UsingCommitRevealEvents,
    UsingCommitRevealErrors
{
    /// @notice the timestamp (in seconds) at which the game starts, in its
    ///         commit phase
    uint256 internal immutable START_TIME;
    /// @notice the duration of the commit phase in seconds
    uint256 internal immutable COMMIT_PHASE_DURATION;
    /// @notice the duration of the reveal phase in seconds
    uint256 internal immutable REVEAL_PHASE_DURATION;
    /// @notice a time source for tests and local play, or zero for the chain's
    ITime internal immutable TIME;
    /// @notice THE CHUNK: how many actions one reveal transaction may carry.
    /// @dev It bounds the TRANSACTION and not the TURN. A turn arrives in as
    ///      many reveals as it takes; a cap on how many actions a turn may
    ///      contain is a game RULE, and the base takes no position on it.
    uint256 internal immutable ACTIONS_PER_REVEAL;
    /// @notice how the cycle advances: see {UsingCommitRevealTypes-CyclePolicy}
    CyclePolicy internal immutable CYCLE_POLICY;

    constructor(CommitRevealConfig memory config) {
        // THE ARITHMETIC THE WHOLE CYCLE RESTS ON, checked once here rather
        // than trusted forever. A cycle is a commit phase followed by a reveal
        // phase and nothing else, so a commitment made in the CURRENT cycle is
        // always still openable. A zero phase punches a hole straight through
        // that - a zero reveal phase makes every commitment unopenable and a
        // zero commit phase makes every commitment impossible - and the hole
        // is silent, because it costs the first player their stake rather than
        // reverting anything. A manual game has no clock, so durations there
        // would describe a schedule that does not exist: refused too.
        if (config.cyclePolicy == CyclePolicy.Manual) {
            if (
                config.commitPhaseDuration != 0 ||
                config.revealPhaseDuration != 0
            ) {
                revert InvalidCycleConfiguration();
            }
        } else if (
            config.commitPhaseDuration == 0 || config.revealPhaseDuration == 0
        ) {
            revert InvalidCycleConfiguration();
        }

        // THE SAME CLASS OF HOLE, one level down. A chunk of zero actions makes
        // every reveal revert, so every turn is committed and none can ever be
        // opened, and the bond is taken by the settlement.
        if (config.actionsPerReveal == 0) {
            revert InvalidActionsPerReveal();
        }

        START_TIME = config.startTime;
        COMMIT_PHASE_DURATION = config.commitPhaseDuration;
        REVEAL_PHASE_DURATION = config.revealPhaseDuration;
        TIME = config.time;
        ACTIONS_PER_REVEAL = config.actionsPerReveal;
        CYCLE_POLICY = config.cyclePolicy;
    }

    //-------------------------------------------------------------------------
    // RESERVE
    //-------------------------------------------------------------------------

    function _reserveOf(uint256 player) internal view returns (uint256) {
        return CommitReveal.reserveOf(player);
    }

    /// @notice Credit a reserve, and make its holder a member.
    /// @dev WHAT MAKES SOMEONE A MEMBER IS THE GAME'S ANSWER, and a reserve
    ///      game's is a funded reserve: holding one is exactly what lets an
    ///      account play, so it is what the cycle waits for. A game whose
    ///      entry is custody of a token calls {_startWaitingFor} from wherever
    ///      custody is taken instead, and never funds a reserve.
    function _addToReserve(uint256 player, uint256 amount) internal {
        uint256 newAmount = CommitReveal.deposit(player, amount);
        if (newAmount != 0) {
            CommitReveal.startWaitingFor(player);
        }
    }

    /// @notice Debit a reserve on its owner's request; emptying it is leaving.
    /// @dev Leaving settles nothing and costs nothing beyond the departure:
    ///      leaving the set the cycle waits for and being punished for going
    ///      silent are different questions, and only the first is the cycle's.
    function _withdrawFromReserve(uint256 player, uint256 amount) internal {
        uint256 newAmount = CommitReveal.withdraw(player, amount);
        if (newAmount == 0) {
            CommitReveal.stopWaitingFor(player);
        }
    }

    //-------------------------------------------------------------------------
    // WHO THE CYCLE WAITS FOR
    //-------------------------------------------------------------------------

    /// @notice Start blocking the cycle on this player. Idempotent.
    function _startWaitingFor(uint256 player) internal {
        CommitReveal.startWaitingFor(player);
    }

    /// @notice Stop blocking the cycle on this player. Idempotent.
    function _stopWaitingFor(uint256 player) internal {
        CommitReveal.stopWaitingFor(player);
    }

    function _isWaitedFor(uint256 player) internal view returns (bool) {
        return CommitReveal.isWaitedFor(player);
    }

    /// @notice The denominator, and how much of it has acted this cycle.
    function _attendance(
        uint64 cycleNumber
    ) internal view returns (Attendance memory) {
        return CommitReveal.attendance(cycleNumber);
    }

    //-------------------------------------------------------------------------
    // COMMIT / REVEAL
    //-------------------------------------------------------------------------

    function _commitmentOf(
        uint256 player
    ) internal view returns (Commitment memory) {
        return CommitReveal.commitmentOf(player);
    }

    /// @notice Bond part of a reserve to a turn this cycle. `player` must
    ///         already be resolved by {_playerOf}.
    function _makeCommitment(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond
    ) internal {
        (uint64 cycleNumber, bool commiting) = _cycleNumber();
        CommitReveal.commit(
            player,
            commitmentHash,
            bond,
            cycleNumber,
            commiting
        );
    }

    /// @notice Take a commitment back while its commit phase is still open.
    ///         `player` must already be resolved by {_playerOf}.
    function _cancelCommitment(uint256 player) internal {
        (uint64 cycleNumber, bool commiting) = _cycleNumber();
        CommitReveal.cancel(player, cycleNumber, commiting);
    }

    /// @notice Check one chunk of a reveal, before the game resolves it.
    /// @param digest The game's hash of the chunk, in the one encoding:
    ///        `bytes24(keccak256(abi.encode(secret, actions, furtherActions)))`.
    /// @param numActions How many actions the chunk carries.
    /// @param furtherActions The hash of the next chunk, or zero for the last.
    /// @return chunk What {_closeChunk} needs once the game has resolved it.
    /// @dev ANYONE MAY REVEAL, which is why this takes no sender: a reveal is
    ///      validated by the hash, and accepting it from anyone is what stops
    ///      an offline player forfeiting.
    ///
    ///      ORDER INDEPENDENCE IS THE GAME'S TO KEEP between this call and the
    ///      next. Reveals arrive in whatever order the mempool delivers them,
    ///      and the board after a cycle must not depend on that: accumulate,
    ///      never branch on what another reveal of the same cycle could have
    ///      changed. See `AGENTS.md`, "Commit-reveal rules".
    function _openChunk(
        uint256 player,
        bytes24 digest,
        uint256 numActions,
        bytes24 furtherActions
    ) internal view returns (CommitReveal.Chunk memory chunk) {
        (uint64 cycleNumber, bool commiting) = _cycleNumber();
        return
            CommitReveal.openChunk(
                player,
                cycleNumber,
                commiting,
                digest,
                numActions,
                furtherActions,
                ACTIONS_PER_REVEAL
            );
    }

    /// @notice Check one chunk of a MISSED reveal: a commitment whose cycle is
    ///         over, settled by being shown what it committed to.
    /// @dev ANYONE MAY SETTLE THIS WAY, because nothing in it can hurt the
    ///      player more than their own silence already has: the chain checks
    ///      that the chunks are exactly what was committed, the game takes its
    ///      penalty for exactly those actions, and the surplus of the bond goes
    ///      back to the player. Nobody but the player receives anything, so a
    ///      stranger settling gains nothing either, which is what makes it safe
    ///      to leave open. Who can is whoever holds the chunks: the player's
    ///      own client, a reveal service, a world playing its own seats.
    ///
    ///      Why it exists at all: a bond may exceed what the turn costs, since a
    ///      bond equal to the exact cost tells everyone how many actions the
    ///      commitment hides. Without the chunks the contract cannot tell the
    ///      surplus from the stake, so forfeiting all of it would punish the
    ///      hiding rather than the silence. See {_forfeitMissedReveal} for the
    ///      settlement that is not shown the chunks.
    function _openMissedChunk(
        uint256 player,
        bytes24 digest,
        uint256 numActions,
        bytes24 furtherActions
    ) internal view returns (CommitReveal.Chunk memory chunk) {
        (uint64 cycleNumber, ) = _cycleNumber();
        return
            CommitReveal.openMissedChunk(
                player,
                cycleNumber,
                digest,
                numActions,
                furtherActions,
                ACTIONS_PER_REVEAL
            );
    }

    /// @notice Apply an opened chunk: charge its cost (a reveal) or forfeit
    ///         its penalty (a missed reveal), and move the chain on.
    /// @param amount For a reveal, what the game's resolution reports the
    ///        chunk cost, taken from the bond and the reserve; a chunk costing
    ///        more than the bond still holds is refused. For a missed reveal,
    ///        the game's penalty for the chunk's actions, capped at the bond
    ///        and handed to {_forfeit}.
    /// @return taken What was charged, or what {_forfeit} took.
    function _closeChunk(
        CommitReveal.Chunk memory chunk,
        uint256 amount
    ) internal returns (uint256 taken) {
        if (!chunk.missed) {
            CommitReveal.closeRevealedChunk(chunk, amount);
            return amount;
        }
        uint256 charged = CommitReveal.closeMissedChunk(chunk, amount);
        taken = _forfeit(chunk.player, charged);
        emit CommitmentVoid(
            chunk.player,
            chunk.cycleNumber,
            chunk.commitmentHash,
            chunk.furtherActions,
            taken
        );
    }

    /// @notice Settle a missed reveal WITHOUT its chunks: the whole remaining
    ///         bond is forfeited.
    /// @param sender Who is settling, normally `msg.sender`.
    /// @param id The identity, as the client named it.
    /// @dev ONLY THE PLAYER OR THEIR DELEGATE, resolved here through
    ///      {_playerOf} so that no route can skip it. A stranger could
    ///      otherwise take a bond whose surplus the player could have
    ///      recovered by settling with the chunks. A player who has lost their
    ///      plan, or who simply wants to play again, still has this route, and
    ///      it is always available: it needs nothing but the identity.
    ///
    ///      LIVENESS IS UNCHANGED BY IT. A member whose past commitment nobody
    ///      settles cannot commit, so the cycle waits for them exactly as for a
    ///      member who does not commit: under a timed policy the clock moves on
    ///      and only early advance is lost.
    function _forfeitMissedReveal(address sender, uint256 id) internal {
        uint256 player = _playerOf(sender, id);
        (uint64 cycleNumber, ) = _cycleNumber();
        (bytes24 head, uint256 bond) = CommitReveal.voidCommitment(
            player,
            cycleNumber
        );
        uint256 forfeited = _forfeit(player, bond);
        emit CommitmentVoid(player, cycleNumber, head, bytes24(0), forfeited);
    }

    //-------------------------------------------------------------------------
    // ADVANCING THE CYCLE
    //-------------------------------------------------------------------------

    /// @notice Move the cycle on, if the rules already permit it.
    /// @dev ITS OWN TRANSACTION, NEVER A RIDER ON THE LAST REVEAL: advancing
    ///      inside a reveal would make that call mean something different
    ///      depending on whether you happened to be last, would make its gas
    ///      depend on winning a race, and would not be retriable. Permissionless
    ///      but strictly conditional, so letting anyone call it grants nothing.
    ///      See {CommitReveal-advance} for unanimity and for why it only ever
    ///      widens a window.
    function _advanceCycle()
        internal
        returns (uint64 cycleNumber, bool commiting)
    {
        return
            CommitReveal.advance(
                _clock(),
                _cycle(),
                CYCLE_POLICY == CyclePolicy.Manual ? 0 : _timestamp()
            );
    }

    //-------------------------------------------------------------------------
    // THE SEAMS
    //-------------------------------------------------------------------------

    /// @notice WHO THE CALLER IS ACTING FOR, having checked that they may.
    /// @param sender The account or key that sent the transaction.
    /// @param id The identity, as the client named it.
    /// @return player The identity this action is filed under, which is what
    ///         every record in {CommitReveal} is keyed by.
    /// @dev THE DEFAULT IS AN ADDRESS GAME: the identity is the account, and
    ///      the only question is authority, answered by the delegation
    ///      library, so a local signer may act for the account that authorised
    ///      it. A token game overrides this to resolve a token and check that
    ///      the caller may act for its owner. RESOLUTION AND AUTHORITY ARE ONE
    ///      FUNCTION ON PURPOSE: splitting them would let a caller reach a
    ///      resolved identity without having passed the check.
    function _playerOf(
        address sender,
        uint256 id
    ) internal view virtual returns (uint256 player) {
        // An identity that is not an address CANNOT BE ONE HERE: two ids that
        // differ above the 160th bit would otherwise be the same player,
        // sharing one reserve and one commitment, with nothing raised anywhere.
        if (id > type(uint160).max) {
            revert InvalidPlayer(id);
        }
        // Zero means "whoever is calling", which the library resolves.
        return
            uint256(
                uint160(
                    Delegation.requireAccountFor(sender, address(uint160(id)))
                )
            );
    }

    /// @notice WHAT NOT REVEALING COSTS.
    /// @param amount What the settlement says is at stake: the game's penalty
    ///        for the chunks it was shown, or the whole remaining bond when it
    ///        was shown none.
    /// @return forfeited How much of it was taken, for the event.
    /// @dev The framework's only requirement is that SOMETHING is lost: a
    ///      player who dislikes what they committed to can always go quiet.
    ///      The default takes the amount out of the reserve and leaves it in
    ///      the contract. A game whose stake is custody of a token seizes the
    ///      token here instead and returns zero - on BOTH settlement routes,
    ///      since a custody game bonds nothing and "only the penalty for what
    ///      was committed" would otherwise cost a player nothing.
    ///
    ///      NOTHING FORFEITED GOES TO WHOEVER SETTLED. A settler that could
    ///      profit would race the player for their own surplus.
    function _forfeit(
        uint256 player,
        uint256 amount
    ) internal virtual returns (uint256 forfeited) {
        return CommitReveal.debit(player, amount);
    }

    /// @notice WHERE THE CYCLE IS. The seam the cycle policy varies at.
    /// @dev The only thing about the clock that is virtual: a game with a
    ///      fourth policy overrides this one function. {_cycleNumber} is
    ///      derived from it rather than the other way round.
    function _cycle() internal view virtual returns (Cycle memory) {
        return
            CommitReveal.cycle(
                _clock(),
                CYCLE_POLICY == CyclePolicy.Manual ? 0 : _timestamp()
            );
    }

    /// @notice The cycle as everything inside this contract asks about it.
    /// @dev Deliberately NOT virtual: {_cycle} is the seam.
    function _cycleNumber()
        internal
        view
        returns (uint64 cycleNumber, bool commiting)
    {
        Cycle memory current = _cycle();
        return (current.cycleNumber, current.commiting);
    }

    //-------------------------------------------------------------------------
    // INTERNALS
    //-------------------------------------------------------------------------

    function _clock() internal view returns (CommitReveal.Clock memory) {
        return
            CommitReveal.Clock({
                policy: CYCLE_POLICY,
                startTime: START_TIME,
                commitPhaseDuration: COMMIT_PHASE_DURATION,
                revealPhaseDuration: REVEAL_PHASE_DURATION
            });
    }

    /// @notice The chain's time, or a test's.
    function _timestamp() internal view returns (uint256) {
        if (address(TIME) == address(0)) {
            return block.timestamp;
        }
        return TIME.timestamp();
    }
}

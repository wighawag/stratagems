// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import {UsingCommitRevealTypes as T} from "./interfaces/UsingCommitRevealTypes.sol";
import {UsingCommitRevealEvents as Ev} from "./interfaces/UsingCommitRevealEvents.sol";
import {UsingCommitRevealErrors as E} from "./interfaces/UsingCommitRevealErrors.sol";

/// @title CommitReveal
/// @notice The commit-reveal mechanism every game on this template shares: a
///         reserve, a bonded commitment that is the head of a hash chain of
///         chunks, the cycle and its policies, who the cycle waits for, and the
///         two ways a missed reveal is settled.
///
/// A LIBRARY OVER NAMESPACED STORAGE, the shape of the etherplay delegation
/// package's `Delegation`, and for the same reasons. Every function is `internal`, so it
/// inlines into the calling contract: no deployment, no linking, `msg.sender`
/// is the caller you expect. And the state lives at an ERC-7201 slot derived
/// from a name, so it collides with nothing a game declares and every route
/// behind a router reads the same record without sharing a base contract's
/// layout.
///
/// IT KNOWS NOTHING OF A GAME'S ACTIONS. A game's routes stay typed; the game
/// computes the commitment digest over its own action type and hands this
/// library the digest and the number of actions. What the library checks is
/// that the digest is the head of the chain and that the chunk has a lawful
/// length; what it charges is what the game's resolution REPORTS. See
/// {UsingCommitReveal-_openChunk} for the pair a game calls around its
/// resolution.
///
/// IT CALLS NO SEAM. Who the caller acts for, what a missed reveal costs and
/// where the cycle is are a game's answers, so they are virtual functions on
/// {UsingCommitReveal}; a library cannot call a virtual function, and the
/// split falls exactly there. A game that wants none of the convenience
/// contract can call this directly and supply its own.
library CommitReveal {
    /// @notice The clock a cycle is read off, as the convenience contract
    ///         holds it in immutables.
    struct Clock {
        T.CyclePolicy policy;
        uint256 startTime;
        uint256 commitPhaseDuration;
        uint256 revealPhaseDuration;
    }

    /// @notice A chunk that has been CHECKED and not yet applied.
    /// @dev Returned by {openChunk} and {openMissedChunk}, consumed by
    ///      {closeRevealedChunk} and {closeMissedChunk}. Opening writes nothing,
    ///      closing writes everything: a game that opened a chunk and forgot to
    ///      close it has not advanced the chain, has not been charged and has
    ///      not counted the turn, so its reveal visibly does not complete.
    struct Chunk {
        uint256 player;
        /// @notice the cycle in progress when the chunk was opened
        uint64 cycleNumber;
        /// @notice the head the chunk opened
        bytes24 commitmentHash;
        /// @notice the head it leaves behind, zero for the last chunk
        bytes24 furtherActions;
        /// @notice opened as a settlement of a missed reveal, not as a reveal
        bool missed;
    }

    /// @custom:storage-location erc7201:etherplay.storage.CommitReveal
    struct Layout {
        /// @notice Tokens a player puts at risk in order to play, keyed by
        ///         WHO PLAYS, which is a number and never an address.
        mapping(uint256 player => uint256 amount) reserve;
        mapping(uint256 player => T.Commitment commitment) commitments;
        /// @notice What the last advance wrote down.
        T.CycleState cycleState;
        /// @notice How many of the members have acted in the cycle it names.
        T.CycleTally tally;
        /// @notice How many members the cycle waits for: the denominator of
        ///         unanimity.
        uint64 waitedFor;
        /// @notice Whether this player is one of them, so the count cannot be
        ///         incremented twice for the same member.
        mapping(uint256 player => bool) isWaitedFor;
    }

    /// keccak256(abi.encode(uint256(keccak256("etherplay.storage.CommitReveal")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant STORAGE_LOCATION =
        0xadc5f43ba75b96408298ed0e334b2a1fd450d7199af4cc31fa65c6246d8b9300;

    /// @dev PRIVATE, so a game cannot write a commitment or a reserve except
    ///      through the functions below, which are where the rules are.
    function layout() private pure returns (Layout storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    //-------------------------------------------------------------------------
    // RESERVE
    //-------------------------------------------------------------------------

    function reserveOf(uint256 player) internal view returns (uint256) {
        return layout().reserve[player];
    }

    /// @notice Credit a player's reserve. Moving the tokens is the caller's.
    function deposit(
        uint256 player,
        uint256 amount
    ) internal returns (uint256 newAmount) {
        Layout storage $ = layout();
        newAmount = $.reserve[player] + amount;
        $.reserve[player] = newAmount;
        emit Ev.ReserveDeposited(player, amount, newAmount);
    }

    /// @notice Debit a player's reserve on their own request.
    /// @dev What is bonded to an open commitment cannot be withdrawn, or a
    ///      player could commit, see the cycle turn against them, and pull
    ///      their stake out instead of revealing.
    ///
    ///      AND YOU CANNOT EMPTY IT WITH A TURN STILL OPEN, which is the same
    ///      rule applied to what is really at stake. A turn bonding ZERO locks
    ///      nothing, so without this a player could commit, empty their
    ///      reserve, cease to be waited for (where membership is a funded
    ///      reserve), and leave the cycle counting their commitment while no
    ///      longer counting them - at which point a SUBSET satisfies unanimity
    ///      and closes the phase on somebody who has not acted. An idle
    ///      player's automatic empty turn bonds exactly zero.
    function withdraw(
        uint256 player,
        uint256 amount
    ) internal returns (uint256 newAmount) {
        Layout storage $ = layout();
        uint256 current = $.reserve[player];

        T.Commitment storage commitment = $.commitments[player];
        uint256 locked = commitment.cycleNumber == 0 ? 0 : commitment.bond;

        if (amount + locked > current) {
            revert E.ReserveTooLow(current, amount + locked);
        }
        if (amount == current && commitment.cycleNumber != 0) {
            revert E.CommitmentStillOpen(commitment.cycleNumber);
        }

        newAmount = current - amount;
        $.reserve[player] = newAmount;
        emit Ev.ReserveWithdrawn(player, amount, newAmount);
    }

    /// @notice Take up to `amount` out of a player's reserve, and say how much.
    /// @dev No event of its own: the caller is a settlement, which reports
    ///      what it took in {UsingCommitRevealEvents-CommitmentVoid}.
    function debit(
        uint256 player,
        uint256 amount
    ) internal returns (uint256 taken) {
        Layout storage $ = layout();
        uint256 current = $.reserve[player];
        taken = amount > current ? current : amount;
        $.reserve[player] = current - taken;
    }

    //-------------------------------------------------------------------------
    // WHO THE CYCLE WAITS FOR
    //-------------------------------------------------------------------------

    function isWaitedFor(uint256 player) internal view returns (bool) {
        return layout().isWaitedFor[player];
    }

    /// @notice Start blocking the cycle on this player.
    /// @dev Idempotent on purpose: the caller is a game rule ("a funded
    ///      reserve means you are in", "an avatar in custody is in") and rules
    ///      fire more than once. A count that could be incremented twice for
    ///      one member would make unanimity unreachable, which is a deadlock
    ///      rather than an error message.
    function startWaitingFor(uint256 player) internal {
        Layout storage $ = layout();
        if ($.isWaitedFor[player]) {
            return;
        }
        $.isWaitedFor[player] = true;
        uint64 count = $.waitedFor + 1;
        $.waitedFor = count;
        emit Ev.WaitedForChanged(player, true, count);
    }

    /// @notice Stop blocking the cycle on this player.
    /// @dev The whole of what leaving means. It settles nothing, returns
    ///      nothing and burns nothing, because those are the GAME's questions
    ///      and answering them here would make "stop waiting for me" into a
    ///      costless exit from a commitment - which is the one thing this
    ///      template may never offer. Idempotent for the same reason as
    ///      {startWaitingFor}: a game that drops a member on forfeit AND on
    ///      withdrawal has two callers, and a count that fell below the members
    ///      who can answer would let a subset satisfy "unanimity".
    function stopWaitingFor(uint256 player) internal {
        Layout storage $ = layout();
        if (!$.isWaitedFor[player]) {
            return;
        }
        $.isWaitedFor[player] = false;
        uint64 count = $.waitedFor - 1;
        $.waitedFor = count;
        emit Ev.WaitedForChanged(player, false, count);
    }

    /// @notice The denominator, and how much of it has acted in this cycle.
    function attendance(
        uint64 cycleNumber
    ) internal view returns (T.Attendance memory result) {
        Layout storage $ = layout();
        result.waitedFor = $.waitedFor;
        T.CycleTally memory tally = $.tally;
        if (tally.cycleNumber == cycleNumber) {
            result.committed = tally.committed;
            result.revealed = tally.revealed;
        }
    }

    //-------------------------------------------------------------------------
    // COMMIT
    //-------------------------------------------------------------------------

    function commitmentOf(
        uint256 player
    ) internal view returns (T.Commitment memory) {
        return layout().commitments[player];
    }

    /// @notice Bond part of a reserve to the head of a turn's hash chain.
    /// @dev ONLY A MEMBER MAY TAKE A TURN, and the reason is arithmetic rather
    ///      than etiquette: unanimity compares how many have committed against
    ///      how many the cycle waits for, and those two have to count the SAME
    ///      SET or the comparison means nothing. Without this any address at
    ///      all could commit - a bond of zero against a reserve of zero passes
    ///      every other check here - and enough throwaway addresses could close
    ///      the commit phase before a real player had acted.
    ///
    ///      Counted once per player per cycle, not once per call: replacing a
    ///      commitment made this cycle is allowed, and counting it again would
    ///      let one player alone satisfy unanimity for the whole set.
    function commit(
        uint256 player,
        bytes24 commitmentHash,
        uint256 bond,
        uint64 cycleNumber,
        bool commiting
    ) internal {
        if (!commiting) {
            revert E.InRevealPhase(cycleNumber);
        }

        Layout storage $ = layout();
        if (!$.isWaitedFor[player]) {
            revert E.NotInGame(player);
        }

        uint256 reserve = $.reserve[player];
        if (bond > reserve) {
            revert E.ReserveTooLow(reserve, bond);
        }

        T.Commitment storage commitment = $.commitments[player];
        if (
            commitment.cycleNumber != 0 && commitment.cycleNumber != cycleNumber
        ) {
            revert E.PreviousCommitmentNotRevealed();
        }

        if (commitment.cycleNumber != cycleNumber) {
            _recordCommitment($, cycleNumber);
        }

        commitment.hash = commitmentHash;
        commitment.cycleNumber = cycleNumber;
        commitment.bond = bond;

        emit Ev.CommitmentMade(player, cycleNumber, commitmentHash, bond);
    }

    function cancel(
        uint256 player,
        uint64 cycleNumber,
        bool commiting
    ) internal {
        if (!commiting) {
            revert E.InRevealPhase(cycleNumber);
        }

        Layout storage $ = layout();
        T.Commitment storage commitment = $.commitments[player];
        if (commitment.cycleNumber == 0) {
            revert E.NoCommitmentToCancel();
        }
        if (commitment.cycleNumber != cycleNumber) {
            revert E.PreviousCommitmentNotRevealed();
        }

        // The hash is not reset, so the slot is never zeroed and the gas cost
        // of the next commitment stays the same whatever happened before it.
        commitment.cycleNumber = 0;
        T.CycleTally storage tally = $.tally;
        if (tally.cycleNumber == cycleNumber && tally.committed != 0) {
            tally.committed -= 1;
        }

        emit Ev.CommitmentCancelled(player, cycleNumber);
    }

    //-------------------------------------------------------------------------
    // REVEAL
    //-------------------------------------------------------------------------

    /// @notice Check a chunk revealed in its own cycle. Writes nothing.
    function openChunk(
        uint256 player,
        uint64 cycleNumber,
        bool commiting,
        bytes24 digest,
        uint256 numActions,
        bytes24 furtherActions,
        uint256 actionsPerReveal
    ) internal view returns (Chunk memory chunk) {
        if (commiting) {
            revert E.InCommitmentPhase(cycleNumber);
        }
        T.Commitment storage commitment = layout().commitments[player];
        uint64 committedIn = commitment.cycleNumber;
        if (committedIn == 0) {
            revert E.NothingToReveal();
        }
        if (committedIn != cycleNumber) {
            revert E.InvalidCycle(cycleNumber, committedIn);
        }
        bytes24 head = commitment.hash;
        _checkChunk(head, digest, numActions, furtherActions, actionsPerReveal);
        chunk = Chunk({
            player: player,
            cycleNumber: cycleNumber,
            commitmentHash: head,
            furtherActions: furtherActions,
            missed: false
        });
    }

    /// @notice Apply what an opened chunk cost, and move the chain on.
    /// @dev THE COST IS TAKEN FROM THE BOND AND FROM THE RESERVE, and a chunk
    ///      that costs more than the bond still holds is refused: the bond was
    ///      fixed before anybody could see the board this resolution ran
    ///      against, so it is the most a turn can spend.
    ///
    ///      THE CYCLE'S TALLY COUNTS TURNS, NOT TRANSACTIONS. The reveal is
    ///      recorded only on the chunk that closes the chain: counting a
    ///      partial reveal would let unanimity close the cycle while a player
    ///      still had chunks owed, and those chunks would then be unrevealable.
    ///
    ///      The surplus of a bond that exceeded the turn goes back to being
    ///      ordinary reserve when the last chunk lands.
    function closeRevealedChunk(Chunk memory chunk, uint256 cost) internal {
        Layout storage $ = layout();
        T.Commitment storage commitment = $.commitments[chunk.player];
        uint256 bond = commitment.bond;
        if (cost > bond) {
            revert E.BondTooLow(bond, cost);
        }
        if (cost != 0) {
            $.reserve[chunk.player] -= cost;
            commitment.bond = bond - cost;
        }

        if (chunk.furtherActions != bytes24(0)) {
            commitment.hash = chunk.furtherActions;
        } else {
            commitment.cycleNumber = 0;
            commitment.bond = 0;
            T.CycleTally storage tally = $.tally;
            if (tally.cycleNumber == chunk.cycleNumber) {
                tally.revealed += 1;
            }
        }

        emit Ev.CommitmentRevealed(
            chunk.player,
            chunk.cycleNumber,
            chunk.commitmentHash,
            chunk.furtherActions,
            cost
        );
    }

    //-------------------------------------------------------------------------
    // SETTLING A MISSED REVEAL
    //-------------------------------------------------------------------------

    /// @notice Check a chunk of a commitment whose cycle is over. Writes
    ///         nothing.
    /// @dev The same chain and the same length rules as a reveal, so the
    ///      settlement is shown exactly what a reveal would have been shown.
    function openMissedChunk(
        uint256 player,
        uint64 cycleNumber,
        bytes24 digest,
        uint256 numActions,
        bytes24 furtherActions,
        uint256 actionsPerReveal
    ) internal view returns (Chunk memory chunk) {
        T.Commitment storage commitment = layout().commitments[player];
        uint64 committedIn = commitment.cycleNumber;
        if (committedIn == 0) {
            revert E.NothingToReveal();
        }
        if (committedIn == cycleNumber) {
            revert E.CanStillReveal(cycleNumber);
        }
        bytes24 head = commitment.hash;
        _checkChunk(head, digest, numActions, furtherActions, actionsPerReveal);
        chunk = Chunk({
            player: player,
            cycleNumber: cycleNumber,
            commitmentHash: head,
            furtherActions: furtherActions,
            missed: true
        });
    }

    /// @notice Earmark the penalty for an opened missed chunk, and move the
    ///         chain on.
    /// @return charged How much of the bond the penalty takes: the penalty,
    ///         capped at what the bond still holds. Forfeiting it is the
    ///         caller's, through its `_forfeit` seam.
    /// @dev On the last chunk the commitment closes and whatever is left of
    ///      the bond is reserve again: what was committed has been established
    ///      and paid for, so the rest was only ever hiding the turn's length.
    function closeMissedChunk(
        Chunk memory chunk,
        uint256 penalty
    ) internal returns (uint256 charged) {
        T.Commitment storage commitment = layout().commitments[chunk.player];
        uint256 bond = commitment.bond;
        charged = penalty > bond ? bond : penalty;
        if (chunk.furtherActions != bytes24(0)) {
            commitment.bond = bond - charged;
            commitment.hash = chunk.furtherActions;
        } else {
            commitment.cycleNumber = 0;
            commitment.bond = 0;
        }
    }

    /// @notice Close a missed commitment without being shown its chunks.
    /// @return head The head it was holding.
    /// @return bond What was still bonded, all of which the caller forfeits.
    function voidCommitment(
        uint256 player,
        uint64 cycleNumber
    ) internal returns (bytes24 head, uint256 bond) {
        T.Commitment storage commitment = layout().commitments[player];
        uint64 committedIn = commitment.cycleNumber;
        if (committedIn == 0) {
            revert E.NothingToReveal();
        }
        if (committedIn == cycleNumber) {
            revert E.CanStillReveal(cycleNumber);
        }
        head = commitment.hash;
        bond = commitment.bond;
        commitment.cycleNumber = 0;
        commitment.bond = 0;
    }

    //-------------------------------------------------------------------------
    // THE CYCLE
    //-------------------------------------------------------------------------

    /// @notice WHERE THE CYCLE IS, under any of the three policies.
    /// @param time The chain time, ignored under the manual policy.
    /// @dev ONE PIECE OF ARITHMETIC SERVES ALL THREE TIMED READINGS, because
    ///      they differ only in where the anchor is. The anchor is the start of
    ///      a cycle's COMMIT phase: for `Timed` it never moves from (cycle 2,
    ///      startTime); for `TimedWithEarlyAdvance` an early advance moves it
    ///      to the moment of the advance, and the clock carries on from there.
    ///      `Manual` has no clock at all, so the stored state IS the answer.
    ///
    ///      Cycles start at 2 so that the hypothetical reveal phase before the
    ///      first commit phase can be cycle 1, which is also why zero can mean
    ///      "no commitment" in {UsingCommitRevealTypes-Commitment}.
    function cycle(
        Clock memory clock,
        uint256 time
    ) internal view returns (T.Cycle memory result) {
        T.CycleState memory state = layout().cycleState;
        bool anchored = state.anchorCycleNumber != 0;
        uint64 anchorCycleNumber = anchored ? state.anchorCycleNumber : 2;

        if (clock.policy == T.CyclePolicy.Manual) {
            // No clock, so no phase bounds: zero here means "there is nothing
            // to count down to".
            return
                T.Cycle({
                    cycleNumber: anchorCycleNumber,
                    commiting: anchored ? state.commiting : true,
                    phaseStart: 0,
                    phaseEnd: 0
                });
        }

        uint256 anchoredAt = anchored ? state.anchoredAt : clock.startTime;
        if (time < anchoredAt) {
            revert E.GameNotStarted();
        }

        uint256 cycleDuration =
            clock.commitPhaseDuration + clock.revealPhaseDuration;
        uint256 elapsed = time - anchoredAt;
        result.cycleNumber =
            anchorCycleNumber + uint64(elapsed / cycleDuration);
        result.commiting =
            (elapsed % cycleDuration) < clock.commitPhaseDuration;

        uint256 cycleStart =
            anchoredAt +
                uint256(result.cycleNumber - anchorCycleNumber) * cycleDuration;

        // AN EARLY OPEN MOVES THE START AND NOT THE DEADLINE. The reveal window
        // becomes "as soon as everyone has committed, until the nominal end",
        // which is strictly wider than the window the clock alone would have
        // given: a reveal scheduled against the nominal time still lands inside
        // it. Shifting the deadline forward instead would lose exactly those
        // reveals, and lose them silently, at the cost of the stake.
        bool openedEarly =
            clock.policy == T.CyclePolicy.TimedWithEarlyAdvance &&
                state.earlyRevealCycleNumber == result.cycleNumber;
        if (openedEarly) {
            result.commiting = false;
        }

        if (result.commiting) {
            result.phaseStart = uint64(cycleStart);
            result.phaseEnd = uint64(cycleStart + clock.commitPhaseDuration);
        } else {
            result.phaseStart =
                openedEarly
                    ? state.earlyRevealAt
                    : uint64(cycleStart + clock.commitPhaseDuration);
            result.phaseEnd = uint64(cycleStart + cycleDuration);
        }
    }

    /// @notice Move the cycle on, if the rules already permit it.
    /// @param current Where the cycle is now, as the caller's `_cycle` seam
    ///        reads it.
    /// @param time The chain time, ignored under the manual policy.
    /// @dev UNANIMITY, NEVER A MAJORITY OR A QUORUM. If a subset could close a
    ///      phase, fast players would time out slow ones and the cycle would
    ///      become a race. And IT ONLY EVER WIDENS A WINDOW: opening the reveal
    ///      phase early does not move its deadline, and closing the cycle early
    ///      is only permitted once every commitment in it has been revealed,
    ///      so there is no window left to shorten. Evaluated at execution
    ///      time, which is what makes it airtight: a reveal still in the
    ///      mempool has not been counted, so an advance mined before it
    ///      reverts rather than stranding it.
    function advance(
        Clock memory clock,
        T.Cycle memory current,
        uint256 time
    ) internal returns (uint64 cycleNumber, bool commiting) {
        if (clock.policy == T.CyclePolicy.Timed) {
            // The cycle simply IS what the clock says, so there is nothing
            // here for anyone to do.
            revert E.NextPhaseNotAllowed();
        }

        Layout storage $ = layout();
        T.Attendance memory present = attendance(current.cycleNumber);

        // No closed set, no denominator. Without this one caller could push an
        // empty game forward as fast as they liked.
        if (present.waitedFor == 0) {
            revert E.NoOneToWaitFor();
        }

        if (current.commiting) {
            if (present.committed < present.waitedFor) {
                revert E.StillWaitingToCommit(
                    present.committed,
                    present.waitedFor
                );
            }
            cycleNumber = current.cycleNumber;
            commiting = false;

            if (clock.policy == T.CyclePolicy.Manual) {
                $.cycleState.anchorCycleNumber = cycleNumber;
                $.cycleState.commiting = false;
            } else {
                // The reveal window opens NOW and closes when it always would
                // have. Recording only that it opened early is what keeps the
                // deadline where it was.
                $.cycleState.earlyRevealCycleNumber = cycleNumber;
                $.cycleState.earlyRevealAt = uint64(time);
            }
        } else {
            if (present.revealed < present.committed) {
                revert E.StillWaitingToReveal(
                    present.revealed,
                    present.committed
                );
            }
            cycleNumber = current.cycleNumber + 1;
            commiting = true;

            $.cycleState.anchorCycleNumber = cycleNumber;
            if (clock.policy == T.CyclePolicy.Manual) {
                $.cycleState.commiting = true;
            } else {
                // The new cycle runs its full length from here, which is the
                // only way early advance makes a game with a clock finish a
                // cycle sooner than the clock would.
                $.cycleState.anchoredAt = uint64(time);
            }
        }

        emit Ev.CycleAdvanced(cycleNumber, commiting, msg.sender);
    }

    //-------------------------------------------------------------------------
    // INTERNALS
    //-------------------------------------------------------------------------

    /// @dev TWO LENGTH RULES, AND NEITHER IS TIDINESS. A chunk may never carry
    ///      more than the configured number, or the bound the whole design
    ///      exists for would hold for every reveal except the last of each
    ///      turn. And a chunk that promises a successor must be exactly FULL,
    ///      or a player dribbles one action per transaction and spreads a turn
    ///      across unbounded reveals.
    function _checkChunk(
        bytes24 head,
        bytes24 digest,
        uint256 numActions,
        bytes24 furtherActions,
        uint256 actionsPerReveal
    ) private pure {
        if (numActions > actionsPerReveal) {
            revert E.TooManyActions(numActions, actionsPerReveal);
        }
        if (furtherActions != bytes24(0) && numActions != actionsPerReveal) {
            revert E.InvalidFurtherActions(numActions, actionsPerReveal);
        }
        if (head != digest) {
            revert E.CommitmentHashNotMatching();
        }
    }

    function _recordCommitment(Layout storage $, uint64 cycleNumber) private {
        T.CycleTally storage tally = $.tally;
        if (tally.cycleNumber != cycleNumber) {
            $.tally = T.CycleTally({
                cycleNumber: cycleNumber,
                committed: 1,
                revealed: 0
            });
        } else {
            tally.committed += 1;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ITime} from "solidity-kit/solc_0_8/debug/time/interfaces/ITime.sol";

/// @title The types of the commit-reveal base
/// @notice Everything the mechanism means by a cycle, a commitment and a tally,
///         and nothing a game means by an action.
/// @dev A game's own types interface INHERITS this one, so its code and its
///      ABI keep naming `Cycle` and `Commitment` unqualified, exactly as they
///      did when these lived in the game. The base never sees an action type:
///      a game's routes are typed (`reveal(player, Placement[] calldata, ...)`)
///      and hand the base a digest and a count. See {UsingCommitReveal}.
interface UsingCommitRevealTypes {
    /// @notice HOW THE CYCLE ADVANCES. One of three, chosen by the deployment.
    /// @dev It used to be derived rather than declared: a game whose two phase
    ///      durations were both zero was a manual game, AND was a game that
    ///      skipped the commit phase, because one flag stood for both. Two
    ///      independent things behind one derivation is what made this look
    ///      like a mode instead of a policy, so the policy is now said out loud
    ///      and the commit phase is never skipped by anybody.
    ///
    ///      `Timed` needs no transaction at all: the cycle simply is what the
    ///      clock says. The other two are advanced by an `advanceCycle` route,
    ///      which is permissionless and strictly conditional - it may only do
    ///      what the rules already permit, so letting anyone call it grants
    ///      nothing.
    enum CyclePolicy {
        /// @notice The clock decides, and nothing else can.
        Timed,
        /// @notice There is no clock. The cycle moves when the players have all
        ///         acted and someone pushes it.
        Manual,
        /// @notice The clock decides the DEADLINE, and unanimity can bring the
        ///         next phase forward. Never the other way round: see
        ///         {UsingCommitReveal-_advanceCycle}.
        TimedWithEarlyAdvance
    }

    /// @notice What the mechanism is configured with. A game's own config
    ///         carries these plus whatever its actions need (a token, a cost).
    struct CommitRevealConfig {
        uint256 startTime;
        uint256 commitPhaseDuration;
        uint256 revealPhaseDuration;
        ITime time;
        /// @notice THE CHUNK: how many actions one reveal transaction may carry.
        /// @dev A DEPLOYMENT PARAMETER AND NOT A CONSTANT, because the two things
        ///      that decide it are both outside the framework: how expensive one
        ///      action is to resolve (the game's) and what fits in a transaction
        ///      (the chain's). Zero is refused at construction: it would make
        ///      every turn unrevealable, which costs the first player their stake
        ///      rather than reverting anything.
        uint256 actionsPerReveal;
        CyclePolicy cyclePolicy;
    }

    /// @notice WHERE THE CYCLE IS, and until when.
    /// @dev The client reads this rather than computing it, because under
    ///      {CyclePolicy-TimedWithEarlyAdvance} the arithmetic alone cannot
    ///      know that a phase was brought forward - that takes a transaction.
    ///      A local clock predicts this correctly right up until someone
    ///      advances early, which is exactly why the prediction is a floor and
    ///      this is the answer.
    struct Cycle {
        uint64 cycleNumber;
        /// @notice true in the commit phase, false in the reveal phase
        bool commiting;
        /// @notice chain time the current phase opened
        /// @dev ZERO MEANS THERE IS NO CLOCK (a Manual game), not "the cycle".
        uint64 phaseStart;
        /// @notice chain time the current phase closes, if nobody advances it
        /// @dev Zero means there is no clock. Under an early advance this is
        ///      the phase's NOMINAL end, unmoved: an advance widens a window
        ///      and never shortens one, which is what keeps a reveal scheduled
        ///      against the nominal time valid.
        uint64 phaseEnd;
    }

    /// @notice WHO THE CYCLE IS WAITING FOR, and how many have acted.
    /// @dev `waitedFor` is the denominator unanimity is measured against, and
    ///      it is deliberately NOT the number of players who are alive: a game
    ///      may keep a silent player in the world while no longer blocking on
    ///      them. What it costs to stop being waited for is the game's, and it
    ///      is a separate question from this count.
    struct Attendance {
        uint64 waitedFor;
        /// @notice how many of them have committed IN THE CURRENT CYCLE
        uint64 committed;
        /// @notice how many of those commitments have been revealed
        uint64 revealed;
    }

    /// @notice What an advance has written down, if anything.
    /// @dev STORAGE ONLY. Read {Cycle} instead; this is the raw anchor it is
    ///      computed from, and every field means something different per
    ///      policy, which is why it is not the thing anyone else reads.
    struct CycleState {
        /// @notice the cycle the anchor names; zero means nothing has advanced
        ///         yet, so the anchor is (cycle 2, START_TIME, commit phase)
        uint64 anchorCycleNumber;
        /// @notice chain time the anchor cycle's COMMIT phase opened (timed
        ///         policies only)
        uint64 anchoredAt;
        /// @notice the cycle whose reveal phase was opened early, if any
        uint64 earlyRevealCycleNumber;
        /// @notice when that happened, which is when that reveal window opened
        uint64 earlyRevealAt;
        /// @notice which phase the anchor cycle is in (Manual only; the timed
        ///         policies read it off the clock)
        bool commiting;
    }

    /// @notice How many members have acted, in the cycle it names.
    /// @dev The cycle is stored WITH the counts so that one slot can serve
    ///      every cycle: a tally whose cycle is not the current one is a tally
    ///      of zero, and the first player to act in a new cycle resets it.
    struct CycleTally {
        uint64 cycleNumber;
        uint64 committed;
        uint64 revealed;
    }

    /// @notice THE HEAD OF A HASH CHAIN, plus what is riding on it.
    /// @dev `hash` is the hash of the NEXT chunk of the turn still owed, which
    ///      for a turn that fits in one transaction is simply the whole turn. A
    ///      reveal rewrites it to the chunk after that, and the commitment stays
    ///      open until a chunk arrives declaring no further actions.
    ///
    ///      `bond` FALLS AS THE CHAIN IS WALKED, by what each chunk costs as it
    ///      lands, so what is left earmarked is what the REST of the turn is
    ///      still holding. It may be MORE than the rest will cost: a bond equal
    ///      to the exact cost would tell everyone how many actions the
    ///      commitment hides, because it is public. The surplus is released
    ///      when the turn closes, by its last reveal or by a settlement shown
    ///      the chunks. See {UsingCommitReveal-_openMissedChunk}.
    struct Commitment {
        bytes24 hash;
        uint64 cycleNumber;
        /// @notice reserve earmarked for what this commitment has NOT yet
        ///         revealed
        uint256 bond;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title The errors of the commit-reveal base
/// @dev Raised by {CommitReveal} and {UsingCommitReveal} through qualified
///      names, and inherited by a game's own errors interface so that they are
///      in the game's ABI where a client decodes them.
interface UsingCommitRevealErrors {
    /// @notice the game has not started yet
    error GameNotStarted();

    /// @notice trying to commit while the reveal phase is running
    error InRevealPhase(uint64 cycleNumber);

    /// @notice trying to reveal while the commit phase is running
    error InCommitmentPhase(uint64 cycleNumber);

    /// @notice there is no commitment to reveal or to void
    error NothingToReveal();

    /// @notice there is no commitment to cancel
    error NoCommitmentToCancel();

    /// @notice an earlier commitment was never revealed; resolve it first
    error PreviousCommitmentNotRevealed();

    /// @notice the commitment belongs to a different cycle
    error InvalidCycle(uint64 currentCycleNumber, uint64 commitmentCycleNumber);

    /// @notice the revealed chunk does not hash to the head of the chain
    error CommitmentHashNotMatching();

    /// @notice the player can still reveal, so the commitment cannot be voided
    error CanStillReveal(uint64 cycleNumber);

    /// @notice this identity cannot play this game
    /// @dev What makes an identity invalid is the GAME's, and it is decided in
    ///      one place: {UsingCommitReveal-_playerOf}. In the base's default,
    ///      an address identity, it means an id that is not an account, and in
    ///      a token game it means a token nobody has put at stake.
    error InvalidPlayer(uint256 id);

    /// @notice the player's reserve cannot cover this
    error ReserveTooLow(uint256 current, uint256 required);

    /// @notice the revealed chunk costs more than the bond still set aside
    error BondTooLow(uint256 bond, uint256 required);

    /// @notice this reveal carries more actions than one transaction may
    /// @dev The chunk is what makes a reveal's worst case CALCULABLE, on every
    ///      chain and whatever a game puts at stake, which is what lets a client
    ///      pass a real gas limit instead of a guess. A final chunk allowed to
    ///      be any length would give that back: the bound would hold for every
    ///      reveal except the last one of every turn.
    error TooManyActions(uint256 length, uint256 allowed);

    /// @notice a reveal that promises more actions did not carry a full chunk
    /// @dev LOAD-BEARING RATHER THAN TIDY. Without it a player dribbles one
    ///      action per transaction and spreads a turn across an unbounded number
    ///      of reveals, which is a denial of service on the reveal phase and on
    ///      everyone else's reads of the board. A chunk that promises a
    ///      successor must therefore be exactly full; only the LAST one may be
    ///      short.
    error InvalidFurtherActions(uint256 length, uint256 required);

    /// @notice a chunk size of zero, which would make every turn unrevealable
    /// @dev Same class as a zero phase duration and refused in the same place:
    ///      it is a deployment mistake whose cost is the first player's stake
    ///      rather than a revert anybody sees.
    error InvalidActionsPerReveal();

    /// @notice this game's cycle is advanced by the clock and by nothing else
    /// @dev A purely timed cycle needs no transaction at all - it simply is
    ///      what the clock says - so there is nothing for a caller to do here
    ///      and pretending otherwise would let one look like it had.
    error NextPhaseNotAllowed();

    /// @notice the phase durations do not describe a cycle this game can run
    /// @dev Both phases must be non-zero on a timed policy, and both must be
    ///      zero on a manual one. See {UsingCommitReveal} for why a zero phase
    ///      is not a configuration but a hole: it makes a commitment either
    ///      impossible to make or impossible to open.
    error InvalidCycleConfiguration();

    /// @notice nobody is being waited for, so unanimity has no denominator
    /// @dev Early advance needs a closed set of members. "Everyone has
    ///      committed" is not a question that can be answered under open
    ///      entry, and answering it against an empty set would let one caller
    ///      spin the cycle forward on their own.
    error NoOneToWaitFor();

    /// @notice this identity has not entered the game, so it cannot take a turn
    /// @dev What entering MEANS is the game's: a funded reserve here, custody of
    ///      a token elsewhere. What the cycle needs is only that the set of
    ///      players who may commit is the same set unanimity is measured
    ///      against - see {UsingCommitReveal-_makeCommitment}.
    error NotInGame(uint256 player);

    /// @notice cannot stop being a member while a turn of yours is still open
    error CommitmentStillOpen(uint64 cycleNumber);

    /// @notice some of the members the cycle waits for have not committed yet
    error StillWaitingToCommit(uint64 committed, uint64 waitedFor);

    /// @notice some of this cycle's commitments have not been revealed yet
    error StillWaitingToReveal(uint64 revealed, uint64 committed);
}

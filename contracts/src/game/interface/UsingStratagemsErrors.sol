// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "./UsingStratagemsTypes.sol";

interface UsingStratagemsErrors is UsingStratagemsTypes {
    /// @notice Game has not started yet, can't perform any action
    error GameNotStarted();

    /// @notice When in Reveal phase, it is not possible to commit new moves or cancel previous commitment
    ///  During Reveal phase, players have to reveal their commitment, if not already done.
    error InRevealPhase();

    /// @notice When in Commit phase, player can make new commitment but they cannot reveal their move yet.
    error InCommitmentPhase();

    /// @notice Previous commitment need to be revealed before making a new one. Even if the corresponding reveal phase has passed.\
    ///  It is also not possible to withdraw any amount from reserve until the commitment is revealed.\
    /// @notice If player lost the information to reveal, it can acknowledge failure which will burn all its reserve.\
    error PreviousCommitmentNotRevealed();

    /// @notice to make a commitment you always need at least one `config.numTokensPerGems` amount in reserve
    ///  Player also need one `config.numTokensPerGems`  per moves during the Reveal phase.
    /// @param inReserve amount in reserver as the time of the call
    /// @param expected amount required to proceed
    error ReserveTooLow(uint256 inReserve, uint256 expected);

    /// @notice Player have to reveal their commitment using the exact same move values
    ///  If they provide different value, the commitment hash will differ and Stratagems will reject their reveal.
    error CommitmentHashNotMatching();

    /// @notice Player can only reveal moves they commited.
    error NothingToReveal();

    /// @notice Player can only reveal their move in the same epoch they commited.abi
    ///  If a player reveal later it can only do to minimize the reserve burn cost by calling : `acknowledgeMissedReveal`
    error InvalidEpoch();

    /// @notice Player can make arbitrary number of moves per epoch. To do so they group moves into (MAX_NUM_MOVES_PER_HASH = 32) moves
    ///  This result in a recursive series of hash that they can then submit in turn while revealing.
    ///  The limit  (MAX_NUM_MOVES_PER_HASH = 32) ensure a reveal batch fits in a block.
    error InvalidFurtherMoves();

    /// @notice Player have to reveal if they can
    /// Stratagems will prevent them from acknowledging missed reveal if there is still time to reveal.
    error CanStillReveal();

    /// @notice The cell configuration is invalid
    /// This can happen win debug mode where admin can setup cell bypassing moves rules
    /// For example when setting up neighborood configuration that would require a cell to have negative life
    error ImpossibleConfiguration();
}

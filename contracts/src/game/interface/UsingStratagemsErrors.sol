// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface UsingStratagemsErrors {
	/// @notice Game has not started yet, can't perform any action
	error GameNotStarted();

	/// @notice When in Resolution phase, it is not possible to commit new moves or cancel previous commitment
	///  During Resolution phase, players have to reveal their commitment, if not already done.
	error InResolutionPhase();

	/// @notice When in Commit phase, player can make new commitment but they cannot resolve their move yet.
	error InCommitmentPhase();

	/// @notice Previous commitment need to be resolved before making a new one. Even if the corresponding reveal phase has passed.\
	///  It is also not possible to withdraw any amount from reserve until the commitment is revealed.\
	/// @notice If player lost the information to reveal, it can acknowledge failure which will burn all its reserve.\
	error PreviousCommitmentNotResolved();

	/// @notice to make a commitment you always need at least one `config.numTokensPerGems` amount in reserve
	///  Player also need one `config.numTokensPerGems`  per moves during the resolution phase.
	/// @param inReserve amount in reserver as the time of the call
	/// @param expected amount required to proceed
	error ReserveTooLow(uint256 inReserve, uint256 expected);

	/// @notice Player have to reveal their commitment using the exact same move values
	///  If they provide different value, the commitment hash will differ and Stratagems will reject their resolution.
	error CommitmentHashNotMatching();

	/// @notice Player can only resolve moves they commited.
	error NothingToResolve();

	/// @notice Player can only resolve their move in the same epoch they commited.abi
	///  If a player resolve later it can only do to minimize the reserve burn cost by calling : `acknowledgeMissedResolution`
	error InvalidEpoch();

	/// @notice Player can make arbitrary number of moves per epoch. To do so they group moves into (MAX_NUM_MOVES_PER_HASH = 32) moves
	///  This result in a recursive series of hash that they can then submit in turn while resolving.
	///  The limit  (MAX_NUM_MOVES_PER_HASH = 32) ensure a resolution batch fits in a block.
	error InvalidFurtherMoves();

	/// @notice Player have to resolve if they can
	/// Stratagems will prevent them from acknowledging missed resolution if there is still time to resolve.
	error CanStillResolve();
}

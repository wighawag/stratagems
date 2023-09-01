// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface UsingStratagemsErrors {
	error GameNotStarted();
	error InResolutionPhase();
	error InCommitmentPhase();
	error PreviousCommitmentNotResolved();
	error ReserveTooLow(uint256 inReserve, uint256 expected);
	error CommitmentHashNotMatching();
	error NothingToResolve();
	error InvalidEpoch();
	error InvalidFurtherMoves();
	error CanStillResolve();
}

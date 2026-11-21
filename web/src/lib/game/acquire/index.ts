/**
 * The acquisition rail: getting what lets you play.
 *
 * See `./acquire.ts` for the shape and `./README.md` for what a game has to
 * supply. A game imports from here rather than from the files, so that the
 * split between the rail and its ledger recovery stays an implementation
 * detail.
 */
export {
	acquisitionAuthorisation,
	acquisitionTotal,
	approveIfShort,
	createAcquisition,
	ERC20_ALLOWANCE_ABI,
	opensAWallet,
	refreshWhenPendingAcquisitionSettles,
	resolveAcquisitionState,
	stipendFor,
	type Acquisition,
	type AcquisitionAuthorisation,
	type AcquisitionCall,
	type AcquisitionDeps,
	type AcquisitionState,
	type AcquisitionStore,
} from './acquire';
export {findPendingAcquisition, type PendingAcquisition} from './pending';
// The registration step with no dialog in front of it, for an offline world.
// jolly-roger's since K2a (`$lib/ui/delegation/authorise-here`, moved up from
// this rail's `authorise.ts`), re-exported here so a game keeps importing the
// rail.
export {
	authoriseTheBrowsersKey,
	type AuthorisationDeps,
	type AuthorisationOutcome,
} from '$lib/ui/delegation/authorise-here';

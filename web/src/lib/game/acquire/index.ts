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
	createAcquisition,
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
export {
	authoriseTheBrowsersKey,
	type AuthorisationDeps,
	type AuthorisationOutcome,
} from './authorise';

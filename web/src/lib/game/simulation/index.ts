/**
 * Running a contract's own code to preview what a plan will do.
 *
 * See `./README.md` for the pattern this asks of a game's contracts (load, a
 * pure core, apply) and `./sandbox.ts` for how the code is run.
 */
export {
	createBytecodeSandbox,
	SandboxRevert,
	type BytecodeSandbox,
	type SandboxContract,
	type SandboxRequest,
} from './sandbox';
export {latestResult, type LatestResult} from './latest';

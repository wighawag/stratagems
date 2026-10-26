import type {Environment} from '../../rocketh/config.js';

/** What the deploy scripts decide from the environment they run in. */
export function getConfig(env: Pick<Environment, 'name' | 'tags'>) {
	return {
		// A `Time` contract (solidity-kit's, an owner-movable offset on the chain's
		// clock), read by the game in place of `block.timestamp`, only where an
		// environment OPTS IN with the `time-contract` tag. None does today: the
		// contract tests advance the chain's own clock (Hardhat's
		// `networkHelpers.time.increase`), a local chain follows the wall clock, and
		// the offline world's Manual policy reads no clock at all. A testnet may
		// take it again (step D of work/plans/join-template-commit-reveal.md),
		// where fast-forwarding a live game was useful (`scripts/skipDays.ts`).
		useTimeContract: !!env.tags['time-contract'] && !env.tags['mainnet'],
	};
}
